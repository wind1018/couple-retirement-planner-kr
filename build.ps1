$ErrorActionPreference = 'Stop'

$workspaceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:DOTNET_CLI_HOME = Join-Path $workspaceRoot '.dotnet-home'
$env:NUGET_PACKAGES = Join-Path $workspaceRoot '.nuget-packages'
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$env:DOTNET_SKIP_FIRST_TIME_EXPERIENCE = '1'
$env:MSBUILDDISABLENODEREUSE = '1'

$commonBuildArgs = @(
    '-m:1',
    '-nr:false',
    '-p:UseSharedCompilation=false',
    '-p:MSBuildEnableWorkloadResolver=false'
)

$restoreSources = @(
    '--source', 'https://api.nuget.org/v3/index.json',
    '--source', 'C:\Program Files\dotnet\library-packs'
)

dotnet restore "$workspaceRoot\src\NpsSimulator.Desktop\NpsSimulator.Desktop.csproj" -r win-x64 @restoreSources -p:MSBuildEnableWorkloadResolver=false
if ($LASTEXITCODE -ne 0) { throw '앱 복원 실패' }

dotnet restore "$workspaceRoot\tests\NpsSimulator.Tests\NpsSimulator.Tests.csproj" @restoreSources -p:MSBuildEnableWorkloadResolver=false
if ($LASTEXITCODE -ne 0) { throw '테스트 복원 실패' }

dotnet build "$workspaceRoot\src\NpsSimulator.Desktop\NpsSimulator.Desktop.csproj" --no-restore @commonBuildArgs
if ($LASTEXITCODE -ne 0) { throw '앱 빌드 실패' }

dotnet build "$workspaceRoot\tests\NpsSimulator.Tests\NpsSimulator.Tests.csproj" --no-restore @commonBuildArgs
if ($LASTEXITCODE -ne 0) { throw '테스트 빌드 실패' }

dotnet "$workspaceRoot\tests\NpsSimulator.Tests\bin\Debug\net10.0\NpsSimulator.Tests.dll"
if ($LASTEXITCODE -ne 0) { throw '자동 테스트 실패' }

$publishDirectory = Join-Path $workspaceRoot 'artifacts\win-x64'
dotnet publish "$workspaceRoot\src\NpsSimulator.Desktop\NpsSimulator.Desktop.csproj" `
    --no-restore `
    -p:PublishProfile=win-x64 `
    -p:PublishDir="$publishDirectory\" `
    @commonBuildArgs
if ($LASTEXITCODE -ne 0) { throw '독립 실행 배포 실패' }

Write-Host "완료: $publishDirectory\NpsSimulator.exe"
