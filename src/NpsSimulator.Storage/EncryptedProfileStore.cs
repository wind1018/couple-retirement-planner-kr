using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using NpsSimulator.Domain;

namespace NpsSimulator.Storage;

public sealed record SavedProfile(
    HouseholdProfile Household,
    HouseholdStrategy ComparisonStrategy,
    SimulationAssumptions Assumptions,
    DateTimeOffset SavedAt);

public sealed class EncryptedProfileStore
{
    private static readonly byte[] Magic = "NPSP1"u8.ToArray();
    private const int SaltSize = 16;
    private const int NonceSize = 12;
    private const int TagSize = 16;
    private const int Iterations = 250_000;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = false,
        WriteIndented = false
    };

    public async Task SaveAsync(string path, SavedProfile profile, string password, CancellationToken cancellationToken = default)
    {
        ValidatePassword(password);
        var directory = Path.GetDirectoryName(Path.GetFullPath(path));
        if (!string.IsNullOrWhiteSpace(directory)) Directory.CreateDirectory(directory);

        var plaintext = JsonSerializer.SerializeToUtf8Bytes(profile, JsonOptions);
        var salt = RandomNumberGenerator.GetBytes(SaltSize);
        var nonce = RandomNumberGenerator.GetBytes(NonceSize);
        var key = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, 32);
        var ciphertext = new byte[plaintext.Length];
        var tag = new byte[TagSize];
        var temporaryPath = $"{path}.{Guid.NewGuid():N}.tmp";

        try
        {
            using var aes = new AesGcm(key, TagSize);
            aes.Encrypt(nonce, plaintext, ciphertext, tag, Magic);
            await using (var stream = new FileStream(temporaryPath, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, true))
            {
                await stream.WriteAsync(Magic, cancellationToken);
                await stream.WriteAsync(salt, cancellationToken);
                await stream.WriteAsync(nonce, cancellationToken);
                await stream.WriteAsync(tag, cancellationToken);
                await stream.WriteAsync(ciphertext, cancellationToken);
                await stream.FlushAsync(cancellationToken);
            }

            File.Move(temporaryPath, path, false);
        }
        finally
        {
            if (File.Exists(temporaryPath)) File.Delete(temporaryPath);
            CryptographicOperations.ZeroMemory(key);
            CryptographicOperations.ZeroMemory(plaintext);
        }
    }

    public async Task<SavedProfile> LoadAsync(string path, string password, CancellationToken cancellationToken = default)
    {
        ValidatePassword(password);
        var payload = await File.ReadAllBytesAsync(path, cancellationToken);
        var minimumSize = Magic.Length + SaltSize + NonceSize + TagSize + 1;
        if (payload.Length < minimumSize || !payload.AsSpan(0, Magic.Length).SequenceEqual(Magic))
            throw new InvalidDataException("지원하지 않거나 손상된 프로필 파일입니다.");

        var offset = Magic.Length;
        var salt = payload.AsSpan(offset, SaltSize).ToArray();
        offset += SaltSize;
        var nonce = payload.AsSpan(offset, NonceSize).ToArray();
        offset += NonceSize;
        var tag = payload.AsSpan(offset, TagSize).ToArray();
        offset += TagSize;
        var ciphertext = payload.AsSpan(offset).ToArray();
        var plaintext = new byte[ciphertext.Length];
        var key = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, 32);

        try
        {
            using var aes = new AesGcm(key, TagSize);
            aes.Decrypt(nonce, ciphertext, tag, plaintext, Magic);
            return JsonSerializer.Deserialize<SavedProfile>(plaintext, JsonOptions)
                   ?? throw new InvalidDataException("프로필 내용이 비어 있습니다.");
        }
        catch (AuthenticationTagMismatchException exception)
        {
            throw new UnauthorizedAccessException("비밀번호가 다르거나 파일이 변조되었습니다.", exception);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(key);
            CryptographicOperations.ZeroMemory(plaintext);
        }
    }

    private static void ValidatePassword(string password)
    {
        if (string.IsNullOrWhiteSpace(password) || password.Length < 8)
            throw new ArgumentException("저장 비밀번호는 8자 이상이어야 합니다.", nameof(password));
    }
}
