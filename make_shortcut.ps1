$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut("$env:USERPROFILE\Desktop\PersonalPlatform-Sync.lnk")
$lnk.TargetPath = "C:\Users\alan\personal-platform\start_server.bat"
$lnk.WorkingDirectory = "C:\Users\alan\personal-platform"
$lnk.WindowStyle = 7
$lnk.Description = "Personal Platform sync server"
$lnk.Save()
Write-Output "OK"
