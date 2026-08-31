using System.Text.Json;
using System.Text.RegularExpressions;
using NpsSimulator.Policy;

namespace NpsSimulator.Storage;

public enum LocalPolicyTrustLevel
{
    BuiltInVerified,
    UserImportedValidated
}

public sealed partial class LocalPolicyStore(string rootDirectory, PolicyValidator validator)
{
    private readonly string _rootDirectory = Path.GetFullPath(rootDirectory);
    private string PacksDirectory => Path.Combine(_rootDirectory, "packs");
    private string ActiveFile => Path.Combine(_rootDirectory, "active-policy.txt");
    private string HistoryFile => Path.Combine(_rootDirectory, "policy-history.json");

    public PolicyPack Initialize(string builtInPolicyJson)
    {
        Directory.CreateDirectory(PacksDirectory);
        var builtIn = PolicyJson.DeserializePack(builtInPolicyJson);
        EnsureValid(builtIn);
        var builtInPath = GetPackPath(builtIn.PolicyPackId);
        if (!File.Exists(builtInPath)) File.WriteAllText(builtInPath, PolicyJson.SerializePack(builtIn));
        var builtInOriginPath = GetOriginPath(builtIn.PolicyPackId);
        if (!File.Exists(builtInOriginPath)) File.WriteAllText(builtInOriginPath, LocalPolicyTrustLevel.BuiltInVerified.ToString());

        if (!File.Exists(ActiveFile))
        {
            WriteAtomically(ActiveFile, builtIn.PolicyPackId);
        }
        else
        {
            TryActivateNewerBuiltInPolicy(builtIn);
        }
        try
        {
            return LoadActive();
        }
        catch (Exception exception) when (exception is IOException or InvalidDataException or JsonException)
        {
            WriteAtomically(ActiveFile, builtIn.PolicyPackId);
            return builtIn;
        }
    }

    private void TryActivateNewerBuiltInPolicy(PolicyPack builtIn)
    {
        var currentId = File.ReadAllText(ActiveFile).Trim();
        if (string.Equals(currentId, builtIn.PolicyPackId, StringComparison.Ordinal)) return;

        var currentPath = GetPackPath(currentId);
        var currentOriginPath = GetOriginPath(currentId);
        if (!File.Exists(currentPath) || !File.Exists(currentOriginPath)) return;
        if (!Enum.TryParse<LocalPolicyTrustLevel>(File.ReadAllText(currentOriginPath).Trim(), out var trust)
            || trust != LocalPolicyTrustLevel.BuiltInVerified) return;

        var current = PolicyJson.DeserializePack(File.ReadAllText(currentPath));
        if (builtIn.PublishedAt <= current.PublishedAt) return;

        var history = LoadHistory().Where(id => !string.Equals(id, currentId, StringComparison.Ordinal)).ToList();
        history.Insert(0, currentId);
        WriteAtomically(HistoryFile, JsonSerializer.Serialize(history.Take(20).ToArray()));
        WriteAtomically(ActiveFile, builtIn.PolicyPackId);
    }

    public PolicyPack LoadActive()
    {
        var id = File.ReadAllText(ActiveFile).Trim();
        var json = File.ReadAllText(GetPackPath(id));
        var pack = PolicyJson.DeserializePack(json);
        EnsureValid(pack);
        return pack;
    }

    public void InstallAndActivate(PolicyPack pack)
    {
        EnsureValid(pack);
        Directory.CreateDirectory(PacksDirectory);
        var currentId = File.Exists(ActiveFile) ? File.ReadAllText(ActiveFile).Trim() : null;
        WriteAtomically(GetPackPath(pack.PolicyPackId), PolicyJson.SerializePack(pack));
        WriteAtomically(GetOriginPath(pack.PolicyPackId), LocalPolicyTrustLevel.UserImportedValidated.ToString());

        if (!string.IsNullOrWhiteSpace(currentId) && !string.Equals(currentId, pack.PolicyPackId, StringComparison.Ordinal))
        {
            var history = LoadHistory().Where(id => !string.Equals(id, currentId, StringComparison.Ordinal)).ToList();
            history.Insert(0, currentId);
            WriteAtomically(HistoryFile, JsonSerializer.Serialize(history.Take(20).ToArray()));
        }

        WriteAtomically(ActiveFile, pack.PolicyPackId);
    }

    public PolicyPack Rollback()
    {
        var history = LoadHistory().ToList();
        while (history.Count > 0)
        {
            var id = history[0];
            history.RemoveAt(0);
            var path = GetPackPath(id);
            if (!File.Exists(path)) continue;
            var pack = PolicyJson.DeserializePack(File.ReadAllText(path));
            EnsureValid(pack);
            WriteAtomically(ActiveFile, id);
            WriteAtomically(HistoryFile, JsonSerializer.Serialize(history));
            return pack;
        }

        throw new InvalidOperationException("되돌릴 이전 정책이 없습니다.");
    }

    public IReadOnlyList<string> ListInstalledPolicyIds() => Directory.Exists(PacksDirectory)
        ? Directory.EnumerateFiles(PacksDirectory, "*.json").Select(path => Path.GetFileNameWithoutExtension(path)!).Order(StringComparer.Ordinal).ToArray()
        : [];

    public LocalPolicyTrustLevel GetActiveTrustLevel()
    {
        var id = File.ReadAllText(ActiveFile).Trim();
        var path = GetOriginPath(id);
        if (!File.Exists(path)) return LocalPolicyTrustLevel.UserImportedValidated;
        return Enum.TryParse<LocalPolicyTrustLevel>(File.ReadAllText(path).Trim(), out var value)
            ? value
            : LocalPolicyTrustLevel.UserImportedValidated;
    }

    private IReadOnlyList<string> LoadHistory()
    {
        if (!File.Exists(HistoryFile)) return [];
        return JsonSerializer.Deserialize<string[]>(File.ReadAllText(HistoryFile)) ?? [];
    }

    private string GetPackPath(string policyPackId)
    {
        if (string.IsNullOrWhiteSpace(policyPackId) || !SafeIdRegex().IsMatch(policyPackId))
            throw new InvalidDataException("정책 ID에 허용되지 않은 문자가 있습니다.");
        var path = Path.GetFullPath(Path.Combine(PacksDirectory, policyPackId + ".json"));
        if (!path.StartsWith(PacksDirectory + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("정책 경로가 저장 폴더를 벗어났습니다.");
        return path;
    }

    private string GetOriginPath(string policyPackId) => Path.ChangeExtension(GetPackPath(policyPackId), ".origin");

    private void EnsureValid(PolicyPack pack)
    {
        var result = validator.Validate(pack);
        if (!result.IsValid)
            throw new InvalidDataException(string.Join(Environment.NewLine, result.Errors.Select(issue => $"[{issue.Code}] {issue.Message}")));
    }

    private static void WriteAtomically(string path, string content)
    {
        var directory = Path.GetDirectoryName(path);
        if (!string.IsNullOrWhiteSpace(directory)) Directory.CreateDirectory(directory);
        var temporaryPath = path + ".tmp";
        File.WriteAllText(temporaryPath, content);
        File.Move(temporaryPath, path, true);
    }

    [GeneratedRegex("^[A-Za-z0-9._-]{3,100}$", RegexOptions.CultureInvariant)]
    private static partial Regex SafeIdRegex();
}
