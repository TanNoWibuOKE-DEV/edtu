Add-Type -AssemblyName System.Drawing
$srcPath = "d:\File_Website\web_edtu\public\logo-dtu.png"
$src = [System.Drawing.Bitmap]::FromFile($srcPath)
$rect = New-Object System.Drawing.Rectangle(0, 0, 242, 242)
$cropped = $src.Clone($rect, $src.PixelFormat)
$cropped.Save("d:\File_Website\web_edtu\public\logo-dtu-emblem.png", [System.Drawing.Imaging.ImageFormat]::Png)
$cropped.Save("d:\File_Website\web_edtu\dist\logo-dtu-emblem.png", [System.Drawing.Imaging.ImageFormat]::Png)
$src.Dispose()
$cropped.Dispose()
Write-Host "Emblem cropped successfully"
