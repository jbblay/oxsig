// Executed as SYSTEM by SSM only inside an owner-authorized, isolated lab VM.
// Generate the password in the guest: it never enters an SSM command or output.
export const windowsAutoLogonSetup = String.raw`
$autoReady = Join-Path $root 'desktop-autologon-v1'
if (-not (Test-Path $autoReady)) {
  if ((Get-CimInstance Win32_ComputerSystem).PartOfDomain) {
    # Domain policies own interactive logon; preserve the existing manual flow.
    Set-Content -Path $autoReady -Value 'manual-domain'
    return
  }
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.ComponentModel;
public static class OxsigLogonSecret {
  [StructLayout(LayoutKind.Sequential)] struct UnicodeString {
    public ushort Length, MaximumLength;
    public IntPtr Buffer;
  }
  [StructLayout(LayoutKind.Sequential)] struct ObjectAttributes {
    public uint Length;
    public IntPtr RootDirectory, ObjectName;
    public uint Attributes;
    public IntPtr SecurityDescriptor, SecurityQualityOfService;
  }
  [DllImport("advapi32.dll")] static extern uint LsaOpenPolicy(IntPtr system, ref ObjectAttributes attributes, uint access, out IntPtr handle);
  [DllImport("advapi32.dll")] static extern uint LsaStorePrivateData(IntPtr handle, ref UnicodeString key, ref UnicodeString value);
  [DllImport("advapi32.dll")] static extern uint LsaClose(IntPtr handle);
  [DllImport("advapi32.dll")] static extern uint LsaNtStatusToWinError(uint status);
  static UnicodeString Convert(string value) {
    return new UnicodeString { Length=(ushort)(value.Length*2), MaximumLength=(ushort)((value.Length+1)*2), Buffer=Marshal.StringToHGlobalUni(value) };
  }
  static void Check(uint status) { if(status != 0) throw new Win32Exception((int)LsaNtStatusToWinError(status)); }
  public static void Store(string password) {
    var attributes = new ObjectAttributes();
    attributes.Length = (uint)Marshal.SizeOf(typeof(ObjectAttributes));
    IntPtr handle;
    Check(LsaOpenPolicy(IntPtr.Zero, ref attributes, 0x20, out handle));
    var key = Convert("DefaultPassword");
    var value = Convert(password);
    try { Check(LsaStorePrivateData(handle, ref key, ref value)); }
    finally {
      Marshal.ZeroFreeGlobalAllocUnicode(value.Buffer);
      Marshal.FreeHGlobal(key.Buffer);
      LsaClose(handle);
    }
  }
}
'@
  $bytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  $password = 'Ox!7' + [Convert]::ToBase64String($bytes)
  $securePassword = ConvertTo-SecureString $password -AsPlainText -Force
  $name = 'oxsig-desktop'
  $account = Get-LocalUser -Name $name -ErrorAction SilentlyContinue
  if ($account) { Set-LocalUser -Name $name -Password $securePassword -PasswordNeverExpires $true }
  else { New-LocalUser -Name $name -Password $securePassword -PasswordNeverExpires -Description 'OXSIG private desktop session' | Out-Null }
  Enable-LocalUser -Name $name
  $users = Get-LocalGroup -SID 'S-1-5-32-545'
  if (-not (Get-LocalGroupMember -Group $users | Where-Object { $_.SID -eq (Get-LocalUser -Name $name).SID })) {
    Add-LocalGroupMember -Group $users -Member $name
  }
  [OxsigLogonSecret]::Store($password)
  $password = $null
  $securePassword.Dispose()
  $winlogon = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'
  Remove-ItemProperty -Path $winlogon -Name DefaultPassword -ErrorAction SilentlyContinue
  New-ItemProperty -Path $winlogon -Name DefaultUserName -Value $name -PropertyType String -Force | Out-Null
  New-ItemProperty -Path $winlogon -Name DefaultDomainName -Value $env:COMPUTERNAME -PropertyType String -Force | Out-Null
  New-ItemProperty -Path $winlogon -Name AutoAdminLogon -Value '1' -PropertyType String -Force | Out-Null
  Remove-ItemProperty -Path $winlogon -Name AutoLogonCount -ErrorAction SilentlyContinue
  New-Item -ItemType File -Force -Path $autoReady | Out-Null
  # Never interrupt an existing interactive user's work. Fresh guests restart
  # once to let Winlogon establish the console session; later boots sign in too.
  if (-not (Get-CimInstance Win32_ComputerSystem).UserName) {
    & shutdown.exe /r /t 5 /c 'OXSIG is preparing the private desktop session'
    if ($LASTEXITCODE -ne 0) { Remove-Item $autoReady -Force; throw 'Desktop restart could not be scheduled' }
  }
}
`;
