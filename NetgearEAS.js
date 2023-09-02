// ==UserScript==
// @name         Netgear Extra Antenna Status
// @namespace    http://github.com/Postrediori/HuaweiMobileDashboard
// @version      0.1
// @description  Additional dashboard with antenna signal data
// @author       Postrediori
// @match        http://192.168.1.1/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// ==/UserScript==

(function() {

'use strict';

/**
 * Constants
 */
const UPDATE_MS = 2000;

/**
 * Global variables
 */
let mode = "";
let history = {"sinr": [], "rsrp": [], "rsrq": [], "rscp": [], "ecio": [], "dl": 0, "ul": 0, "dlultime":0};
let boxcar = 100, gt = 3, gw = boxcar*(gt+1), gh = 30;

/**
 * Format download/upload value
 * @param {Number} bytesPerSec Number of bytes per second
 * @returns Formatted string with proper units (kbps, mpbs, etc)
 */
function formatBandwidth(bytesPerSec) {
    const SIZE_KB = 1024;
    const SIZE_MB = 1024 * 1024;
    const SIZE_GB = 1024 * 1024 * 1024;
    
    const RATE_BPS = "bit/s";
    const RATE_KBPS = "KBit/s";
    const RATE_MBPS = "MBit/s";

    const bitsPerSec = bytesPerSec * 8;
    
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
 * Convert Netgear's internal network mode ID to human format
 * @param {String} mode Network mode ID
 * @returns Human readable networking mode (GSM, WCDMA, LTE)
 */
function getModeDescription(mode) {
    switch(mode) {
    case "WcdmaService": return "WCDMA";
    case "LteService": return "LTE";
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

        for (let k in history) history[k] = Array.isArray(history[k]) ? [] : 0;

        if (mode === "WCDMA") {
            setVisible("status_3g", true);
        }
        else if (mode === "LTE") {
            setVisible("status_lte", true);
        }
    }
}

function barGraph(p, val, min, max) {
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
        url: '/api/model.json?internalapi=1',
        error: function(request,status,error) {
            console.log("Error: Cannot get Signal data:", request.status, "\nmessage:", request.responseText, "\nerror:", error);
        },
        success: function(data) {
            const doc = JSON.parse(data);
            if (doc) {
                const currentMode = getModeDescription(doc.wwan.currentNWserviceType);
                const caStatus = doc.wwan.ca.SCCcount;

                const fullMode = `${currentMode}${caStatus===0?"":"-A"}`;
                let report = `Network mode : ${fullMode}`;
                setParam("mode", fullMode);
                setMode(currentMode);

                const rssi = doc.wwan.signalStrength.rssi;
                report += `\nRSSI : ${rssi}dBm`;

                setParam("rssi", `${rssi}dBm`);

                if (mode === "WCDMA") {
                    const rscp = doc.wwan.signalStrength.rscp;
                    const ecio = doc.wwan.signalStrength.ecio;
                    report += `\nRSCP : ${rscp}dBm EC/IO : ${ecio}dB`;
                    
                    setParam("rscp", `${rscp}dBm`); barGraph("rscp", rscp, -100, -70);
                    setParam("ecio", `${ecio}dB`); barGraph("ecio", ecio, -10, -2);
                }
                else if (mode === "LTE") {
                    const rsrq = doc.wwan.signalStrength.rsrq;
                    const rsrp = doc.wwan.signalStrength.rsrp;
                    const sinr = doc.wwan.signalStrength.sinr;
                    report += `\nRSRQ/RSRP/SINR : ${rsrq}dB/${rsrp}dBm/${sinr}dB`;
                    
                    setParam("rsrp", `${rsrp}dBm`); barGraph("rsrp", rsrp, -130, -60);
                    setParam("rsrq", `${rsrq}dB`); barGraph("rsrq", rsrq, -16, -3);
                    setParam("sinr", `${sinr}dB`); barGraph("sinr", sinr, 0, 24);
                }

                const dl = doc.wwan.dataTransferredRx;
                const ul = doc.wwan.dataTransferredTx;

                const dlultime = new Date().getTime();

                if (history["dlultime"]!==0) {
                    const t = dlultime - history["dlultime"];
                    const dlRate = history["dl"]===0 ? 0 : Math.floor((dl - history["dl"]) * 1000 / t);
                    const ulRate = history["ul"]===0 ? 0 : Math.floor((ul - history["ul"]) * 1000 / t);
                    report += `\nDownload : ${dlRate.toFixed(0)} Upload : ${ulRate.toFixed(0)}`;
        
                    setParam("dl", formatBandwidth(dlRate));
                    setParam("ul", formatBandwidth(ulRate));
    
                    history["dl"] = dl;
                    history["ul"] = ul;
                }

                history["dlultime"] = dlultime;

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
        EC/IO:<span id="ecio">#</span><div id="becio"></div>
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
