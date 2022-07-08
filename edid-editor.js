'use strict';

/*
version: 1.0.0, 2022.7.8

*/



let registryExportedEdid = {};
let originalEdidBlock0 = [];
let newEdidBlock0 =[];

// DOM elements
const elMsgEdidCheckSumMismatch = document.getElementById('msg-edid-check-sum-mismatch-warn');
const elMsgEdidOverrideExist = document.getElementById('msg-edid-override-exist-warn');
const elMsgRegFileParseFailed = document.getElementById('msg-reg-file-parse-failed');
const elInfoOrigScreenPhysicalSize = document.getElementById('info-orig-screen-physical-size');
const elInfoOrigPtmVideoSize = document.getElementById('info-orig-ptm-video-size');
const elInputScreenHPixel = document.getElementById('input-screen-h-pixel');
const elInputScreenVPixel = document.getElementById('input-screen-v-pixel');
const elInputScreenDiagonalSize = document.getElementById('input-screen-diagonal-size');
const elCheckboxShouldChangePtmDimension = document.getElementById('checkbox-should-change-ptm-dimension');
const elInfoNewScreenPhysicalSize = document.getElementById('info-new-screen-physical-size');
const elInfoNewScreenPhysicalSizeDiagonalInch = document.getElementById('info-new-screen-physical-size-inch');
const elBtnDownloadEdidOverrideRegFile = document.getElementById('btn-download-edid-override-reg-file');
const elBtnDownloadEdidOverrideRemovalRegFile = document.getElementById('btn-download-edid-override-removal-reg-file');
const elInfoDeviceInstancePath = document.getElementById('info-device-instance-path');


// from EDID spec 1.4
const EDID_SPEC = {
    addrHeaderStart: 0x00,
    Header: [0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00],

    addrEdidVersion: 0x12,
    edidVersion: 0x01,

    addrEdidRevision: 0x13,
    edidRevision4: 0x04,
    edidRevision3: 0x03,

    addrBasicDisplayParamPhysicalHorizontalSize: 0x15,
    addrBasicDisplayParamPhysicalVerticalSize: 0x16,
    
    addrPreferredTimingModeHorizontalPixelSizeLower8Bits: 0x36 + 2,
    addrPreferredTimingModeHorizontalPixelSizeUpper4Bits: 0x36 + 4,     // in upper nibble
    addrPreferredTimingModeVerticalPixelSizeLower8Bits: 0x36 + 5,
    addrPreferredTimingModeVerticalPixelSizeUpper4Bits: 0x36 + 7,       // in upper nibble
    
    addrPreferredTimingModeHorizontalVideoImageSizeLower8Bits: 0x36 + 12,
    addrPreferredTimingModeVerticalVideoImageSizeLower8Bits: 0x36 + 13,
    // upper 4 bits nibble: Horizontal, lower 4 bits nibble: Vertical
    addrPreferredTimingModeVideoImageSizeUpperBits: 0x36 + 14,
}


function byteNumberToHexStr(number) {
    // convert 0-255 to 2 char hex string
    if (number < 0 || number > 255) {
        throw 'ValueError: only accept 0-255, but got: ' + number;
    }
    return number.toString(16).padStart(2, '0');
}


function inchToCm(length) {
    // convert inch to centimeter
    return length * 2.54;
}


function cmToInch(length) {
    // convert centimeter to inch
    return length / 2.54;
}


function calculateScreenDiagonalSize(hSize, vSize) {
    // input unit: cm, px, inch, etc.
    // return unit: same as input
    return Math.hypot(hSize, vSize);
}


function calculateScreenDimensionByDiagonalSize(diagonalLength, hPixel, vPixel) {
    // input unit: cm, px, px
    // return unit: cm
    // calculate horizontal and vertical size by diagonal and pixel size.
    let diagonalPixel = calculateScreenDiagonalSize(hPixel, vPixel);
    let scale = diagonalLength / diagonalPixel;
    return [hPixel * scale, vPixel * scale];
}


function calculateEdidBlock0CheckSum(partialEdidArray) {
    // EDID block 0 array, from 0-127
    // return: EDID block 0 check sum (128th/last byte)
    if (partialEdidArray.length !== 127) {
        throw 'Exception: invalid EDID Byte count, must equal to 127!';
    }
    let sum = 0;
    partialEdidArray.forEach(element => {
        sum += element;
    });

    // EDID Standard: (all 128 Bytes' sum) % 256 == 0x00
    let remainder = sum % 256;
    // return (256 - remainder) & 0xff;
    if (remainder === 0) {
        return 0x00;
    } else {
        return 256 - remainder;
    }
}


function verifyEdidBlock0CheckSum(edidArray) {
    // verify EDID block 0 check sum
    let desiredCsum = calculateEdidBlock0CheckSum(edidArray.slice(0,127));
    let actualCsum = edidArray[127];

    if (desiredCsum === actualCsum) {
        return true;
    } else {
        console.warn('EDID check sum mismatch! desired:' + byteNumberToHexStr(desiredCsum) +
                     ', reported:' + byteNumberToHexStr(actualCsum));
        return false;
    }
}


function getEdidScreenPtmPixelSize(edidArray) {
    // PTM screen pixels
    let hPixel =  edidArray[EDID_SPEC.addrPreferredTimingModeHorizontalPixelSizeLower8Bits] + 
                ((edidArray[EDID_SPEC.addrPreferredTimingModeHorizontalPixelSizeUpper4Bits] & 0xf0) << 4);

    let vPixel =  edidArray[EDID_SPEC.addrPreferredTimingModeVerticalPixelSizeLower8Bits] + 
                ((edidArray[EDID_SPEC.addrPreferredTimingModeVerticalPixelSizeUpper4Bits] & 0xf0) << 4);

    return [hPixel, vPixel]
}


function getEdidScreenPtmDimension(edidArray) {
    // PTM Video size, unit: cm
    let hSizeMm = edidArray[EDID_SPEC.addrPreferredTimingModeHorizontalVideoImageSizeLower8Bits] + 
    ((edidArray[EDID_SPEC.addrPreferredTimingModeVideoImageSizeUpperBits] & 0xf0) << 4);

    let vSizeMm = edidArray[EDID_SPEC.addrPreferredTimingModeVerticalVideoImageSizeLower8Bits] + 
    ((edidArray[EDID_SPEC.addrPreferredTimingModeVideoImageSizeUpperBits] & 0x0f) << 8);
    
    // mm -> cm
    return [hSizeMm / 10, vSizeMm / 10];
}


function getEdidScreenPhysicalDimension(edidArray) {
    // return: unit cm
    let hSize = edidArray[EDID_SPEC.addrBasicDisplayParamPhysicalHorizontalSize];
    let vSize = edidArray[EDID_SPEC.addrBasicDisplayParamPhysicalVerticalSize];

    if (hSize === 0 || vSize === 0) {
        // if any Byte is 0, then these two value represent aspect ratio or reserved, not physical size.
        return [0, 0]
    } else {
        return [hSize, vSize];
    }
}


function setEdidScreenDimension(edidArray, hSize, vSize, setPtmSize=false) {
    // unit cm
    // return: new edid block

    // set 0x15, 0x16 (Basic Display Parameters and Features)
    // set 0x36 -> 0x47 (Preferred Timing Mode)

    // EDID 1.4 standard: screen dimension in 0x15,0x16 (physical screen size) should round to nearest centimeter.
    // EDID 1.4 standard: screen dimension in 0x15,0x16 (physical screen size) should greater than or equal to
    // 0x36 -> 0x47 (Preferred Timing Mode:addressable video image sizes)

    hSize = Math.round(hSize);
    vSize = Math.round(vSize);

    // do not use round(), use ceil() instead.
    //hSize = Math.ceil(hSize);
    //vSize = Math.ceil(vSize);

    hSize = hSize > 255 ? 255 : hSize;
    vSize = vSize > 255 ? 255 : vSize;
    hSize = hSize < 0 ? 0 : hSize;
    vSize = vSize < 0 ? 0 : vSize;

    // create a copy of source EDID data
    let newEdid = edidArray.slice();
    
    // set physical size
    newEdid[EDID_SPEC.addrBasicDisplayParamPhysicalHorizontalSize] = hSize;
    newEdid[EDID_SPEC.addrBasicDisplayParamPhysicalVerticalSize] = vSize;

    if (setPtmSize) {
        let ptmHSize = hSize * 10;
        let ptmVSize = vSize * 10;
        
        // set PTM video image size
        let ptmHUpper4Bits = (ptmHSize >> 8) & 0x0f;    // &0x0f: not required
        let ptmVUpper4Bits = (ptmVSize >> 8) & 0x0f;
        let ptmImageSizeUpperByte = (ptmHUpper4Bits << 4) | (ptmVUpper4Bits);
        newEdid[EDID_SPEC.addrPreferredTimingModeVideoImageSizeUpperBits] = ptmImageSizeUpperByte;
        newEdid[EDID_SPEC.addrPreferredTimingModeHorizontalVideoImageSizeLower8Bits] = ptmHSize & 0xff;
        newEdid[EDID_SPEC.addrPreferredTimingModeVerticalVideoImageSizeLower8Bits] = ptmVSize & 0xff;
    }
    let csum = calculateEdidBlock0CheckSum(newEdid.slice(0,127));
    newEdid[127] = csum;

    return newEdid;
}


function resetApp() {
    // clear input, check box, hex viewer, etc.

    // clear global vars
    originalEdidBlock0 = [];
    newEdidBlock0 = [];
    registryExportedEdid = {
        isValidRegFile: false,
        isEdidFound: false,
        isEdidOverridden: false,
        deviceInstancePath: '',
        edidData: [],
    };
    
    // hide warning message
    elMsgEdidCheckSumMismatch.style.display = 'none';
    elMsgEdidOverrideExist.style.display = 'none';
    elMsgRegFileParseFailed.style.display = 'none';
    // clear info text
    elInfoDeviceInstancePath.innerText = '';
    elInfoOrigScreenPhysicalSize.innerText = '';
    elInfoOrigPtmVideoSize.innerText = '';
    elInfoNewScreenPhysicalSize.innerText = '';
    elInfoNewScreenPhysicalSizeDiagonalInch.innerText = '';
    // reset input
    elInputScreenHPixel.value = 0;
    elInputScreenVPixel.value = 0;
    elInputScreenDiagonalSize.value = 0;
    elCheckboxShouldChangePtmDimension.checked = false;
    // reset download button
    elBtnDownloadEdidOverrideRegFile.disabled = true;
    elBtnDownloadEdidOverrideRemovalRegFile.disabled = true;

    // remove event listener
    elInputScreenDiagonalSize.removeEventListener('change', calculateNewEdid);
    elCheckboxShouldChangePtmDimension.removeEventListener('change', calculateNewEdid);
    elInputScreenHPixel.removeEventListener('change', calculateNewEdid);
    elInputScreenVPixel.removeEventListener('change', calculateNewEdid);
    elBtnDownloadEdidOverrideRegFile.removeEventListener('click', onClickDownloadOverrideRegBtn);
    elBtnDownloadEdidOverrideRemovalRegFile.removeEventListener('click', onClickDownloadOverrideRemovalRegBtn);

    updateHexView();
}


function parseRegFile(fileContent) {
    fileContent = fileContent.trim();
    // merge multi-line hex data to single line: example: `.... ff,\`
    fileContent = fileContent.replaceAll(/\\\r*\n\s*/gm, '');

    let lines = fileContent.split('\n');
    
    // check .reg file header
    if (lines[0].trim().toLocaleLowerCase() === 'windows registry editor version 5.00') {
        registryExportedEdid.isValidRegFile = true;
    } else {
        // stop parse .reg file
        return;
    }

    // regular expressions
    const iniFileSectionRe = /^\[HKEY_.*?\]$/i;
    const deviceParametersSectionRe = /\[HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Enum\\(?<instancePath>DISPLAY\\.*?)\\Device Parameters\]/i;
    const edidOverrideSectionRe = /\[HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Enum\\(?<instancePath>DISPLAY\\.*?)\\Device Parameters\\EDID_OVERRIDE\]/i;
    const edidHexTextRe = /"EDID"=hex:(?<edidText>([a-f\d]{2}\s*,?\s*){128,})/i;
    const edidOverrideBlock0HexTextRe = /"0"=hex:(?<edidText>([a-f\d]{2}\s*,?\s*){128,})/i;

    // import edid data from .reg file
    let currentRegFileSection = '';
    for (let i=0; i<lines.length; i++) {
        let content = lines[i].trim();

        // is a reg/ini file section ?
        if (content.match(iniFileSectionRe)) {
            // display device parameters section
            if (content.match(deviceParametersSectionRe)) {
                currentRegFileSection = 'deviceParameters';
                registryExportedEdid.deviceInstancePath = content.match(deviceParametersSectionRe).groups.instancePath;
                continue;
            }
            // display device EDID override section
            if (content.match(edidOverrideSectionRe)) {
                currentRegFileSection = 'edidOverrideSection';
                continue;
            }
            // other sections
            currentRegFileSection = content;
            continue;
        }

        // parse edid reg keys
        if (currentRegFileSection === 'deviceParameters') {
            if (content.match(edidHexTextRe)) {
                let hexText = content.match(edidHexTextRe).groups.edidText.split(',');
                let edidData = [];
                // convert hex string to js number object
                for (let i=0; i<hexText.length; i++) {
                    let txt = hexText[i].trim();
                    let val = parseInt(txt, 16);
                    if (isNaN(val)) {
                        alert('invalid hex string: ' + txt);
                    } else {
                        edidData.push(val);
                    }
                }
                // 避免有无法 parseInt 的内容, 可能性较小, 因为数据来自于 regexp 匹配的 hex pattern
                if (edidData.length === hexText.length) {
                    registryExportedEdid.edidData = edidData;
                    registryExportedEdid.isEdidFound = true;
                }
                continue;
            }
        }

        // parse edid override keys
        if (currentRegFileSection === 'edidOverrideSection') {
            if (content.match(edidOverrideBlock0HexTextRe)) {
                registryExportedEdid.isEdidOverridden = true;
                continue;
            }
        }
    }
}


function parseExportedEdidData() {
    originalEdidBlock0 = registryExportedEdid.edidData.slice(0,128);
    newEdidBlock0 = registryExportedEdid.edidData.slice(0,128);
    
    // verify EDID check sum
    if (! verifyEdidBlock0CheckSum(originalEdidBlock0)) {
        elMsgEdidCheckSumMismatch.style.display = 'block';
    }
    // verify EDID header
    let header = originalEdidBlock0.slice(EDID_SPEC.addrHeaderStart, EDID_SPEC.Header.length);
    if (EDID_SPEC.Header.toString() !== header.toString()) {
        alert("ERROR: invalid EDID 1.4 header!");
        throw "invalid EDID 1.4 header";
    }
    
    // verify EDID version
    if (originalEdidBlock0[EDID_SPEC.addrEdidVersion] !== EDID_SPEC.edidVersion) {
        alert("ERROR: unsupported EDID Version!");
        throw "unsupported EDID Version";
    }
    if ((originalEdidBlock0[EDID_SPEC.addrEdidRevision] !== EDID_SPEC.edidRevision4) && 
        (originalEdidBlock0[EDID_SPEC.addrEdidRevision] !== EDID_SPEC.edidRevision3))
    {
        alert("ERROR: unsupported EDID Revision!");
        throw "unsupported EDID Revision";
    }
}


function updateUI() {
    if (! registryExportedEdid.isValidRegFile) {
        alert("invalid .reg file content!");
        elMsgRegFileParseFailed.style.display = 'block';
        return;
    }
    
    if (! registryExportedEdid.isEdidFound) {
        alert("EDID infomation not found in .reg file!");
        elMsgRegFileParseFailed.style.display = 'block';
        return;
    }

    if (registryExportedEdid.isEdidOverridden) {
        elMsgEdidOverrideExist.style.display = 'block';
    }

    parseExportedEdidData();

    let screenPixelSize = getEdidScreenPtmPixelSize(originalEdidBlock0);
    let screenPhysicalDimension = getEdidScreenPhysicalDimension(originalEdidBlock0);
    
    elInputScreenHPixel.value = screenPixelSize[0];
    elInputScreenVPixel.value = screenPixelSize[1];

    elInputScreenDiagonalSize.value = cmToInch(calculateScreenDiagonalSize(screenPhysicalDimension[0], screenPhysicalDimension[1])).toFixed(1);
    elInfoOrigScreenPhysicalSize.innerText = screenPhysicalDimension.join('x');
    elInfoOrigPtmVideoSize.innerText = getEdidScreenPtmDimension(originalEdidBlock0).join('x');
    elInfoDeviceInstancePath.innerText = registryExportedEdid.deviceInstancePath;
    
    updateHexView();
    elBtnDownloadEdidOverrideRegFile.disabled = false;
    elBtnDownloadEdidOverrideRemovalRegFile.disabled = false;

    // add event listener
    elInputScreenDiagonalSize.addEventListener('change', calculateNewEdid);
    elCheckboxShouldChangePtmDimension.addEventListener('change', calculateNewEdid);
    elInputScreenHPixel.addEventListener('change', calculateNewEdid);
    elInputScreenVPixel.addEventListener('change', calculateNewEdid);

    elBtnDownloadEdidOverrideRegFile.addEventListener('click', onClickDownloadOverrideRegBtn);
    elBtnDownloadEdidOverrideRemovalRegFile.addEventListener('click', onClickDownloadOverrideRemovalRegBtn);

}


function updateHexView() {
    // display new EDID in hex format
    function createTr(rowHeadText) {
        let tr = document.createElement('tr');
        let th = document.createElement('th');
        th.innerText = rowHeadText;
        tr.appendChild(th);
        return tr;
    }

    let tbody = document.getElementById('hex-view-tbody');
    let rowNumber = 0;
    let columnNumber = 0;
    // clear previous data
    for (let i=tbody.rows.length - 1; i>=0; i--) {
        tbody.deleteRow(i);
    }

    tbody.appendChild(createTr(byteNumberToHexStr(rowNumber)));
    newEdidBlock0.forEach( (value, index) => {
        if (columnNumber > 15) {
            columnNumber = 0;
            rowNumber += 1;
            let thText = rowNumber << 4;
            tbody.appendChild(createTr(byteNumberToHexStr(thText)));
        }
        columnNumber += 1;

        let cell = document.createElement('td');
        cell.innerText = byteNumberToHexStr(value);
        if (originalEdidBlock0[index] !== value) {
            cell.classList.add('hex-view-different');
        }
        tbody.rows[rowNumber].appendChild(cell);
    });
}


// event hanlder, when user change screen size, etc.
function calculateNewEdid(e) {
    let newInchSize = parseFloat(elInputScreenDiagonalSize.value);
    if (isNaN(newInchSize)) {
        let screenPhysicalDimension = getEdidScreenPhysicalDimension(originalEdidBlock0);
        elInputScreenDiagonalSize.value = cmToInch(calculateScreenDiagonalSize(screenPhysicalDimension[0], screenPhysicalDimension[1])).toFixed(1);
    }

    let hPixel = parseInt(elInputScreenHPixel.value);
    let vPixel = parseInt(elInputScreenVPixel.value);
    // TODO: validate input 

    let newScreenDimension = calculateScreenDimensionByDiagonalSize(inchToCm(newInchSize), hPixel, vPixel);
    newEdidBlock0 = setEdidScreenDimension(originalEdidBlock0, newScreenDimension[0], newScreenDimension[1], elCheckboxShouldChangePtmDimension.checked);

    let appliedDimension = getEdidScreenPhysicalDimension(newEdidBlock0);
    elInfoNewScreenPhysicalSize.innerText = appliedDimension.join('x');
    elInfoNewScreenPhysicalSizeDiagonalInch.innerText = cmToInch(calculateScreenDiagonalSize(appliedDimension[0], appliedDimension[1])).toFixed(1);
    updateHexView();
}


function hexViewOnClickCopyBtn(e) {
    let hexString = edidArrayToHexString(newEdidBlock0);
    navigator.clipboard.writeText(hexString).then(() => {
        alert("Hex string copied to clipboard!");
    })
    .catch(error => {
        alert('Failed to copy hex string:' + error);
    });
}


function edidArrayToHexString(edidArray) {
    let hexString = '';
    edidArray.forEach((element) => {
        // skip first element
        if (hexString.length > 0) {
            hexString +=',';
        }
        hexString += byteNumberToHexStr(element);
    });

    return hexString;
}


function generateOverrideRegistryFile() {
    let deviceInstancePath = registryExportedEdid.deviceInstancePath;
    let blockNumber = 0;
    let hexString = edidArrayToHexString(newEdidBlock0);

    let regFileContent = `Windows Registry Editor Version 5.00\r\n\r\n` + 
    `[HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Enum\\${deviceInstancePath}\\Device Parameters\\EDID_OVERRIDE]\r\n` +
    `"${blockNumber}"=hex:${hexString}\r\n`;

    let blob = window.URL.createObjectURL(new Blob([regFileContent]));
    return blob;
}


function generateOverrideRemovalRegistryFile() {
    let deviceInstancePath = registryExportedEdid.deviceInstancePath;
    let blockNumber = 0;

    let regFileContent = `Windows Registry Editor Version 5.00\r\n\r\n` + 
    `[HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Enum\\${deviceInstancePath}\\Device Parameters\\EDID_OVERRIDE]\r\n` +
    `"${blockNumber}"=-\r\n`;

    let blob = window.URL.createObjectURL(new Blob([regFileContent]));
    return blob;
}


function doDownload(filename, url) {
    let download = document.createElement('a');
    download.setAttribute('href', url);
    download.setAttribute('download', filename);
    download.style.display = 'none';
    document.body.appendChild(download);

    download.click();

    document.body.removeChild(download);
}


function onClickDownloadOverrideRegBtn(e) {
    let blob = generateOverrideRegistryFile();
    let filename = registryExportedEdid.deviceInstancePath + '-' +
        elInputScreenDiagonalSize.value + 'inch-edid_override.reg';
    doDownload(filename, blob);
    window.URL.revokeObjectURL(blob);
}


function onClickDownloadOverrideRemovalRegBtn(e) {
    let blob = generateOverrideRemovalRegistryFile();
    let filename = registryExportedEdid.deviceInstancePath + '-edid_override_removal.reg';
    doDownload(filename, blob);
    window.URL.revokeObjectURL(blob);
}


document.getElementById('btn-copy-hex-view-content-string').addEventListener('click', hexViewOnClickCopyBtn);


// open .reg file button event
document.getElementById('btn-open-reg-file').addEventListener('change', function() {
    let reader = new FileReader();
    reader.onload = function() {
        resetApp();
        parseRegFile(reader.result);
        updateUI();
        console.log(registryExportedEdid);
    }
    
    reader.readAsText(this.files[0]);
});


/*
require ES2015
TODO: check difference between EDID 1.3 and 1.4

*/
