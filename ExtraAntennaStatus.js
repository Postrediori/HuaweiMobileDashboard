// ==UserScript==
// @name         Huawei Extra Antenna Status dashboard
// @namespace    http://github.com/Postrediori/HuaweiMobileDashboard
// @version      0.1
// @description  Additional dashboard with antenna signal data
// @author       Postrediori
// @match        http://192.168.8.1/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// ==/UserScript==

(function() {

'use strict';

/**
 * Constants
 */
const UPDATE_MS = 2000;

const NETWORK_MODE_2G = "0";
const NETWORK_MODE_3G = "2";
const NETWORK_MODE_4G = "7";

const SIZE_KB = 1024;
const SIZE_MB = 1024 * 1024;
const SIZE_GB = 1024 * 1024 * 1024;

const RATE_BPS = "bit/s";
const RATE_KBPS = "KBit/s";
const RATE_MBPS = "MBit/s";

/**
 * Global variables
 */
var mode = "";

/**
 * Extract tag from XML
 * @param {String} tag Name of the tag
 * @param {String} data String with XML data
 * @returns COntents of the tag
 */
function extractXML(tag, data) {
    try {
        return data.split("</" + tag + ">")[0].split("<" + tag + ">")[1];
    }
    catch (err) {
        console.log("XML Error: ", err.message);
        return err.message;
    }
}

/**
 * Format download/upload value
 * @param {Number} bytesPerSec Number of bytes per second
 * @returns Formatted string with proper units (kbps, mpbs, etc)
 */
function formatBandwidth(bytesPerSec) {
    var bitsPerSec = bytesPerSec * 8;

    if (bitsPerSec<SIZE_KB) {
        return `${bitsPerSec}${RATE_BPS}`;
    }
    else if (bitsPerSec<SIZE_MB) {
        return `${(bitsPerSec / SIZE_KB).toFixed(2)}${RATE_KBPS}`;
    }
    else {
        return `${(bitsPerSec / SIZE_MB).toFixed(2)}${RATE_MBPS}`;
    }
}

/**
 * Convert Huawei's internal network mode ID to human format
 * @param {String} mode Network mode ID
 * @returns Human readable networking mode (GSM, WCDMA, LTE)
 */
function getModeDescription(mode) {
    switch(mode) {
    case NETWORK_MODE_2G: return "GSM";
    case NETWORK_MODE_3G: return "WCDMA";
    case NETWORK_MODE_4G: return "LTE";
    }
    return "Unknown mode";
}

/**
 * Set output label of the parameter in the UI
 * @param {String} param ID f the control in the UI
 * @param {String} val Value of the parameter
 */
function setParam(param, val) {
    try {
        document.getElementById(param).innerHTML = val;
    } catch (param) {};
}

/**
 * Switch networking mode. Update visibility of UI controls.
 * Does nothing if mode didn't change.
 * @param {String} newMode New networking mode (WCDMA, LTE)
 */
function setMode(newMode) {
    if (mode !== newMode) {
        mode = newMode;
        console.log("Network mode set to ", mode);

        document.getElementById("status_3g").style.display = "none";
        document.getElementById("status_lte").style.display = "none";

        if (mode === "WCDMA") {
            document.getElementById("status_3g").style.display = "block";
        }
        else if (mode === "LTE") {
            document.getElementById("status_lte").style.display = "block";
        }
    }
}

/**
 * Update UI dashboard with current status of the modem
 */
function currentBand() {
    var report = "";

    $.ajax({
        type: "GET",
        async: true,
        url: '/api/device/signal',
        error: function(request,status,error) {
            console.log("Signal Error:"+request.status+"\n"+"message:"+request.responseText+"\n"+"error:"+error);
        },
        success: function(data) {
            const currentMode = getModeDescription(extractXML("mode",data));

            report = report + "Network mode : "+currentMode;
            setParam("mode", currentMode);
            setMode(currentMode);

            const rssi = extractXML("rssi",data);
            report = report + "\nRSSI : "+rssi;

            setParam("rssi", rssi);

            if (mode === "WCDMA") {
                const rscp = extractXML("rscp",data);
                const ecio = extractXML("ecio",data);
                report = report + "\nRSCP : "+rsrq+" EC/IO : "+ecio;
                
                setParam("rscp", rscp);
                setParam("ecio", ecio);
            }
            else if (mode === "LTE") {
                const rsrq = extractXML("rsrq",data);
                const rsrp = extractXML("rsrp",data);
                const sinr = extractXML("sinr",data);
                report = report + "\nRSRQ/RSRP/SINR : "+rsrq+"/"+rsrp+"/"+sinr;
                
                setParam("rsrp", rsrp);
                setParam("rsrq", rsrq);
                setParam("sinr", sinr);
            }
        }
    });

    $.ajax({
        type: "GET",
        async: true,
        url: '/api/monitoring/traffic-statistics',
        error: function(request,status,error) {
            console.log("Traffic statistics Error:"+request.status+"\n"+"message:"+request.responseText+"\n"+"error:"+error);
        },
        success: function(data) {
            const dl = extractXML("CurrentDownloadRate",data);
            const ul = extractXML("CurrentUploadRate",data);
            report = report + "\nDownload : "+dl+" Upload : "+ul;

            setParam("dl", formatBandwidth(dl));
            setParam("ul", formatBandwidth(ul));
        }
    });

    if (report!=="") {
        console.log(report);
    }
}

function statusHeader() {
const header = `<style>
    #mode,
    #rssi,
    #rscp,
    #ecio,
    #rsrq,
    #rsrp,
    #sinr,
    #ul,
    #dl {
        color: #b00;
        font-weight: strong;
    }

    .f {
        float: left;
        border: 1px solid #bbb;
        border-radius: 5px;
        padding: 10px;
        line-height: 2em;
        margin: 5px;
    }

    .f ul {
        margin: 0;
        padding: 0;
    }

    .f ul li {
        display: inline;
        margin-right: 10px;
    }
</style>
<div style="display:block;overflow:auto;">
    <div class="f" id="status_general">
        <ul>
            <li>Network mode:<span id="mode">#</span></li>
            <li>RSSI:<span id="rssi">#</span></li>
        </ul>
    </div>
    <div class="f" id="status_3g">
        <ul>
            <li>RSCP:<span id="rscp">#</span></li>
            <li>EC/Io:<span id="ecio">#</span></li>
        </ul>
    </div>
    <div class="f" id="status_lte">
        <ul>
            <li>RSRQ:<span id="rsrq">#</span></li>
            <li>RSRP:<span id="rsrp">#</span></li>
            <li>SINR:<span id="sinr">#</span></li>
        </ul>
    </div>
    <div class="f" id="bandwidth">
        <ul>
            <li>Download:<span id="dl">#</span></li>
            <li>Upload:<span id="ul">#</span></li>
        </ul>
    </div>
</div>`;
    document.body.insertAdjacentHTML("afterbegin", header);
}

statusHeader();
setInterval(currentBand, UPDATE_MS);

})();
