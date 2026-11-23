$ErrorActionPreference = "Continue"
$base = "G:\gdownloads\pppppp\metatrade-r"
Set-Location $base

$dirMap = @{
    "01" = "01_system_architecture"
    "02" = "01_system_architecture"
    "03" = "01_system_architecture"
    "04" = "02_smart_contract_architecture"
    "05" = "02_smart_contract_architecture"
    "06" = "02_smart_contract_architecture"
    "07" = "03_protocol_workflows"
    "08" = "03_protocol_workflows"
    "09" = "03_protocol_workflows"
    "10" = "03_protocol_workflows"
    "11" = "03_protocol_workflows"
    "12" = "04_state_and_data_models"
    "13" = "04_state_and_data_models"
    "14" = "04_state_and_data_models"
    "15" = "04_state_and_data_models"
    "16" = "05_security_architecture"
    "17" = "05_security_architecture"
    "18" = "05_security_architecture"
    "19" = "06_experimental_architecture"
    "20" = "06_experimental_architecture"
}

$sources = Get-ChildItem "thesis/diagrams/sources/*.mmd"
foreach ($f in $sources) {
    $num = $f.BaseName.Substring(0,2)
    $dir = $dirMap[$num]
    $outDir = "thesis/diagrams/$dir"
    $base = $f.BaseName

    $content = [System.IO.File]::ReadAllText($f.FullName)
    $encoded = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($content))

    # PNG
    $pngPath = "$outDir/$base.png"
    $pngUrl = "https://mermaid.ink/img/$encoded"
    try {
        Invoke-WebRequest -Uri $pngUrl -OutFile $pngPath -ErrorAction Stop
        Write-Host "PNG: $base.png OK"
    } catch {
        Write-Host "PNG: $base.png FAILED - $($_.Exception.Message)"
    }

    # SVG
    $svgPath = "$outDir/$base.svg"
    $svgUrl = "https://mermaid.ink/svg/$encoded"
    try {
        Invoke-WebRequest -Uri $svgUrl -OutFile $svgPath -ErrorAction Stop
        Write-Host "SVG: $base.svg OK"
    } catch {
        Write-Host "SVG: $base.svg FAILED - $($_.Exception.Message)"
    }
}

echo "Done rendering all diagrams."
EOF