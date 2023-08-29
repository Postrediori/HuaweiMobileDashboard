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
let mode = "";
let history = {"sinr": [], "rsrp": [], "rsrq": [], "rscp": [], "ecio": []};
let boxcar = 125, gt = 3, gw = boxcar*(gt+1), gh = 30;

/**
 * Convert string with XML into Document object
 * @param {String} data String with XML data
 * @returns Document object or null
 */
function getXMLDocument(data) {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(data, "application/xml");
        const errorNode = doc.querySelector("parsererror");

        if (errorNode) {
            console.log("XML Error: Error while parsing XML document");
            return null;
        }

        return doc;
    }
    catch (err) {
        console.log("XML Error:", err.message);
    }
    return null;
}

/**
 * Extract tag from XML
 * @param {String} tag Name of the tag
 * @param {String} data Document object with XML data
 * @returns Contents of the tag or null
 */
function extractXML(tag, document) {
    try {
        const tags = document.getElementsByTagName(tag);
        if (tags.length > 0) {
            return tags[0].innerHTML;
        }
    }
    catch (err) {
        console.log("XML Error:", err.message);
    }
    return null;
}

/**
 * Format download/upload value
 * @param {Number} bytesPerSec Number of bytes per second
 * @returns Formatted string with proper units (kbps, mpbs, etc)
 */
function formatBandwidth(bytesPerSec) {
    let bitsPerSec = bytesPerSec * 8;

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
 * Set visibility of a block specifiedby id
 * @param {String} id Id of a block
 * @param {Boolean} visible Flag of visibility
 */
function setVisible(id, visible) {
    document.getElementById(id).style.display = visible ? "block" : "none";
}

/**
 * Switch networking mode. Update visibility of UI controls.
 * Does nothing if mode didn't change.
 * @param {String} newMode New networking mode (WCDMA, LTE)
 */
function setMode(newMode) {
    if (mode !== newMode) {
        mode = newMode;
        console.log("Network mode set to", mode);

        setVisible("status_3g", false);
        setVisible("status_lte", false);

        for (let k in history) { history[k] = []; }

        if (mode === "WCDMA") {
            setVisible("status_3g", true);
        }
        else if (mode === "LTE") {
            setVisible("status_lte", true);
        }
    }
}

function barGraph(p, v, c, min, max) {
    let val = v.slice(0, -c);
    if(val > max){val = max;}
    if(val < min){val = min;}
    history[p].unshift(val);
    if(history[p].length > boxcar){history[p].pop();}
    let html = `<svg version="1.1" viewBox="0 0 ${gw} ${gh}" width="${gw}" height="${gh}" preserveAspectRatio="xMaxYMax slice" style="border:1px solid #ccc;padding:1px;margin-top:-6px;width:${gw}px;">`;

    for (let x = 0; x < history[p].length; x++) {
        let pax = (gt + 1) * (x + 1);
        let pay = gh - 1;
        let pby = gh - (history[p][x] - min) / (max - min) * gh;
        if (isNaN(pby)){pby = pay;}
        let pc = (history[p][x] - min) / (max - min) * 100;
        let color = pc < 50 ? "red" : (pc < 85 ? "orange" : "green");
        html += `<line x1="${pax}" y1="${pay}" x2="${pax}" y2="${pby}" stroke="${color}" stroke-width="${gt}"></line>`;
    }
    html += "</svg>";
    document.getElementById("b" + p).innerHTML = html;
}

/**
 * Update UI dashboard with current status of the modem
 */
function currentBand() {
    $.ajax({
        type: "GET",
        async: true,
        url: '/api/device/signal',
        error: function(request,status,error) {
            console.log("Error: Cannot get Signal data:", request.status, "\nmessage:", request.responseText, "\nerror:", error);
        },
        success: function(data) {
            const doc = getXMLDocument(data);
            if (doc) {
                const currentMode = getModeDescription(extractXML("mode", doc));

                let report = `Network mode : ${currentMode}`;
                setParam("mode", currentMode);
                setMode(currentMode);

                const rssi = extractXML("rssi", doc);
                report += `\nRSSI : ${rssi}`;

                setParam("rssi", rssi);

                if (mode === "WCDMA") {
                    const rscp = extractXML("rscp",doc);
                    const ecio = extractXML("ecio",doc);
                    report += `\nRSCP : ${rscp} EC/IO : ${ecio}`;
                    
                    setParam("rscp", rscp); barGraph("rscp", rscp, 3, -100, -70);
                    setParam("ecio", ecio); barGraph("ecio", ecio, 2, 0, 24);
                }
                else if (mode === "LTE") {
                    const rsrq = extractXML("rsrq",doc);
                    const rsrp = extractXML("rsrp",doc);
                    const sinr = extractXML("sinr",doc);
                    report += `\nRSRQ/RSRP/SINR : ${rsrq}/${rsrp}/${sinr}`;
                    
                    setParam("rsrp", rsrp); barGraph("rsrp", rsrp, 3, -130, -60);
                    setParam("rsrq", rsrq); barGraph("rsrq", rsrq, 2, -16, -3);
                    setParam("sinr", sinr); barGraph("sinr", sinr, 2, 0, 24);
                }

                console.log(report);
            }
        }
    });

    $.ajax({
        type: "GET",
        async: true,
        url: '/api/monitoring/traffic-statistics',
        error: function(request,status,error) {
            console.log("Error: Traffic statistics responce fail:", request.status, "\nmessage:", request.responseText, "\nerror:", error);
        },
        success: function(data) {
            const doc = getXMLDocument(data);
            if (doc) {
                const dl = extractXML("CurrentDownloadRate", doc);
                const ul = extractXML("CurrentUploadRate", doc);
                const report = `Download : ${dl} Upload : ${ul}`;
    
                setParam("dl", formatBandwidth(dl));
                setParam("ul", formatBandwidth(ul));

                console.log(report);
            }
        }
    });
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
        RSCP:<span id="rscp">#</span><div id="brscp"></div>
        EC/Io:<span id="ecio">#</span><div id="becio"></div>
    </div>
    <div class="f" id="status_lte">
        RSRQ:<span id="rsrq">#</span><div id="brsrq"></div>
        RSRP:<span id="rsrp">#</span><div id="brsrp"></div>
        SINR:<span id="sinr">#</span><div id="bsinr"></div>
    </div>
    <div class="f" id="bandwidth">
        <ul>
            <li>Download:<span id="dl">#</span></li>
            <li>Upload:<span id="ul">#</span></li>
        </ul>
    </div>
</div>`;
    document.body.insertAdjacentHTML("afterbegin", header);
    setInterval(currentBand, UPDATE_MS);
}

statusHeader();

})();
