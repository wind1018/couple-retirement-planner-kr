using NpsSimulator.Policy;
using NpsSimulator.Storage;

namespace NpsSimulator.Application;

public sealed class PolicyManagementService(
    LocalPolicyStore store,
    PolicyUpdateService updateService,
    AiPolicyKitService kitService)
{
    public PolicyPack CurrentPolicy { get; private set; } = null!;
    public LocalPolicyTrustLevel CurrentTrustLevel { get; private set; }
    public PolicyUpdateResult? LastImportResult { get; private set; }
    public string? LastRejectedJson { get; private set; }

    public PolicyPack Initialize(string builtInPolicyJson)
    {
        CurrentPolicy = store.Initialize(builtInPolicyJson);
        CurrentTrustLevel = store.GetActiveTrustLevel();
        return CurrentPolicy;
    }

    public PolicyUpdateResult InspectUpdate(string updateJson)
    {
        try
        {
            var document = updateService.DeserializeUpdate(updateJson);
            LastImportResult = updateService.Apply(CurrentPolicy, document);
        }
        catch (Exception exception) when (exception is System.Text.Json.JsonException or InvalidDataException or NotSupportedException)
        {
            LastImportResult = new(false, null, [new("JSON_INVALID", exception.Message, true)], []);
        }

        LastRejectedJson = LastImportResult.IsValid ? null : updateJson;
        return LastImportResult;
    }

    public PolicyPack ActivateInspectedUpdate()
    {
        if (LastImportResult is not { IsValid: true, UpdatedPack: not null })
            throw new InvalidOperationException("활성화할 검증 완료 정책이 없습니다.");
        store.InstallAndActivate(LastImportResult.UpdatedPack);
        CurrentPolicy = LastImportResult.UpdatedPack;
        CurrentTrustLevel = store.GetActiveTrustLevel();
        LastImportResult = null;
        LastRejectedJson = null;
        return CurrentPolicy;
    }

    public PolicyPack Rollback()
    {
        CurrentPolicy = store.Rollback();
        CurrentTrustLevel = store.GetActiveTrustLevel();
        LastImportResult = null;
        LastRejectedJson = null;
        return CurrentPolicy;
    }

    public void ExportAiUpdateKit(string destinationPath, string guideMarkdown) =>
        kitService.ExportUpdateKit(destinationPath, CurrentPolicy, guideMarkdown);

    public void ExportAiFixKit(string destinationPath)
    {
        if (LastImportResult is null || LastRejectedJson is null)
            throw new InvalidOperationException("수정 요청으로 내보낼 검증 실패 파일이 없습니다.");
        kitService.ExportFixKit(destinationPath, LastRejectedJson, LastImportResult.Issues, CurrentPolicy);
    }
}
