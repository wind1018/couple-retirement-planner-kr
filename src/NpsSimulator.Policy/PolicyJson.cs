using System.Text.Json;
using System.Text.Json.Serialization;

namespace NpsSimulator.Policy;

public static class PolicyJson
{
    public static JsonSerializerOptions Options { get; } = CreateOptions();

    public static PolicyPack DeserializePack(string json) =>
        JsonSerializer.Deserialize<PolicyPack>(json, Options)
        ?? throw new InvalidDataException("정책 파일이 비어 있습니다.");

    public static string SerializePack(PolicyPack pack) => JsonSerializer.Serialize(pack, Options);

    private static JsonSerializerOptions CreateOptions()
    {
        var options = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = false,
            ReadCommentHandling = JsonCommentHandling.Disallow,
            AllowTrailingCommas = false,
            WriteIndented = true,
            UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow
        };
        options.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseUpper));
        return options;
    }
}
