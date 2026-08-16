# Gera a chave de upload da Play (android/remetum-release.jks).
# Uso: na pasta do repo, rode: powershell -ExecutionPolicy Bypass -File scripts/create-upload-key.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$android = Join-Path $root "android"
$jks = Join-Path $android "remetum-release.jks"
$props = Join-Path $android "keystore.properties"
$jbr = "C:\Program Files\Android\Android Studio\jbr"

if (-not (Test-Path $android)) {
  throw "Pasta android nao encontrada. Rode este script a partir do repo ebano."
}
if (Test-Path $jks) {
  throw "Ja existe $jks. Nao gere outra chave se esta ja foi usada na Play."
}
if (-not (Test-Path "$jbr\bin\keytool.exe")) {
  throw "Java do Android Studio nao encontrado em $jbr"
}

$env:JAVA_HOME = $jbr
$env:Path = "$jbr\bin;" + $env:Path

$secure = Read-Host "Crie uma senha forte (nao esqueca; voce precisa dela para sempre)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$pass = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

if ([string]::IsNullOrWhiteSpace($pass) -or $pass.Length -lt 6) {
  throw "Senha muito curta. Use pelo menos 6 caracteres."
}
if ($pass -notmatch '^[\x20-\x7E]+$') {
  throw "A senha so pode ter letras, numeros e simbolos do teclado ingles (sem acento, cedilha ou emoji). Rode o script de novo."
}

& keytool -genkeypair `
  -keystore $jks `
  -alias remetum `
  -keyalg RSA `
  -keysize 2048 `
  -validity 10000 `
  -storepass $pass `
  -keypass $pass `
  -dname "CN=Remetum, OU=Remetum, O=Remetum, L=Brasil, ST=BR, C=BR"
if ($LASTEXITCODE -ne 0) {
  if (Test-Path $jks) { Remove-Item $jks -Force }
  throw "keytool falhou (codigo $LASTEXITCODE). A chave NAO foi criada."
}

@"
storeFile=remetum-release.jks
storePassword=$pass
keyAlias=remetum
keyPassword=$pass
"@ | Set-Content -Path $props -Encoding ASCII

Write-Host ""
Write-Host "Chave criada em: $jks"
Write-Host "Guarde o arquivo .jks e a senha fora deste PC (Drive, pendrive). Sem isso voce nao atualiza o app na Play."
Write-Host "Proximos passos no Android Studio: Build > Generate Signed App Bundle / APK"
