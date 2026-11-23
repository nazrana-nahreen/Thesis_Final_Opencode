$ErrorActionPreference = "Continue"
$base = "G:\gdownloads\pppppp\metatrade-r"
$mmdc = "node_modules/@mermaid-js/mermaid-cli/src/cli.js"
Set-Location $base

# Map diagram number prefix to directory
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

    # PNG
    $pngPath = "$outDir/$base.png"
    & node $mmdc -i $f.FullName -o $pngPath -w 1920 -H 1080 -b transparent 2>&1 | Out-Null
    if (Test-Path $pngPath) { Write-Host "PNG: $base.png OK" } else { Write-Host "PNG: $base.png FAILED" }

    # SVG
    $svgPath = "$outDir/$base.svg"
    & node $mmdc -i $f.FullName -o $svgPath -b transparent 2>&1 | Out-Null
    if (Test-Path $svgPath) { Write-Host "SVG: $base.svg OK" } else { Write-Host "SVG: $base.svg FAILED" }
}

# Copy source files to sources dir (already there)
echo "Done rendering."
EOF