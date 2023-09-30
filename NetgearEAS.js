// ==UserScript==
// @name         Netgear Extra Antenna Status
// @namespace    http://github.com/Postrediori/HuaweiMobileDashboard
// @version      0.5
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

const boxcar = 78, gt = 3, gw = boxcar*(gt+1), gh = 30, ghd = gh * 1.75;

const SIZE_KB = 1024;
const SIZE_MB = 1024 * 1024;
const SIZE_GB = 1024 * 1024 * 1024;

/**
 * Global variables
 */
let mode = "";
let history = {sinr: [], rsrp: [], rsrq: [], rscp: [], ecio: [], dl: 0, ul: 0, dlultime:0, dlul:[]};

/**
 * Format download/upload value
 * @param {Number} bytesPerSec Number of bytes per second
 * @returns Formatted string with proper units (kbps, mpbs, etc)
 */
function formatBandwidth(bytesPerSec) {
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
    case "GsmService": return "GSM";
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
function setVisible(id, visible, t="block") {
    document.getElementById(id).style.display = visible ? t : "none";
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

        setVisible("u3g", false);
        setVisible("ulte", false);

        for (let k in history) history[k] = Array.isArray(history[k]) ? [] : 0;

        if (mode === "WCDMA") {
            setVisible("status_3g", true);
            setVisible("u3g", true);
        }
        else if (mode === "LTE") {
            setVisible("status_lte", true);
            setVisible("ulte", true);
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

function nearestFib(x) {
    let f1=0, f2=1, fn = 0;

    for (let n=1; n<20; n++) {
        fn = f1 + f2;
        if (x<fn) {
            break;
        }
        f2 = f1;
        f1 = fn;
    }
    return fn;
}

function barGraphDlUl(p, valDl, valUl) {
    history[p].unshift([valDl*8, valUl*8]);
    if(history[p].length > boxcar){history[p].pop();}

    let maxDlUl = history[p].reduce( (accum,current) => [Math.max(accum[0],current[0]),Math.max(accum[1],current[1])] );
    maxDlUl = Math.max(maxDlUl[0], maxDlUl[1]);
    const maxMb = nearestFib(maxDlUl / SIZE_MB);

    const maxPlot = maxMb * SIZE_MB;

    const MARGIN=6;
    let html = `<svg version="1.1" viewBox="0 0 ${gw} ${ghd}" width="${gw}" height="${ghd}" preserveAspectRatio="xMaxYMax slice" style="border:1px solid #ccc;padding:1px;margin-top:${-MARGIN}px;width:${gw}px;">`;

    for (let x = 0; x < history[p].length; x++) {
        let dl = history[p][x][0], ul = history[p][x][1];

        let pax = (gt + 1) * (x + 1);
        let pay = ghd - 1;

        let pbyDl = ghd * (1 - dl / maxPlot);
        let pbyUl = ghd * (1 - ul / maxPlot);

        let pby1 = pay, pby2 = pay;
        let color1 = "#DDCC77", color2 = "grey";
        if (ul < dl) {
            pby1 = pbyUl;
            pby2 = pbyDl;
            color2 = "#332288";
        }
        else {
            pby1 = pbyDl;
            pby2 = pbyUl;
            color2 = "#88CCEE";
        }

        html += `<line x1="${pax}" y1="${pay}" x2="${pax}" y2="${pby1}" stroke="${color1}" stroke-width="${gt}"></line>`;
        html += `<line x1="${pax}" y1="${pby1}" x2="${pax}" y2="${pby2}" stroke="${color2}" stroke-width="${gt}"></line>`;
    }
    html += `<text x="${gw}" y="${MARGIN}" dominant-baseline="hanging" text-anchor="end" style="fill:gray;">${maxMb.toFixed(0)}MBit/s</text>`;
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
                let caStatus = doc.wwan.ca.SCCcount;
                if (typeof caStatus==='undefined') {
                    caStatus = 0;
                }

                const fullMode = `${currentMode}${caStatus===0?"":"-A"}`;
                let report = `Network mode : ${fullMode}`;
                setParam("mode", fullMode);
                setMode(currentMode);

                const band = doc.wwanadv.curBand;
                setParam("band", band);
                setVisible("castat", caStatus!==0, "inline");
                setParam("ca", caStatus);
                report += `\nBand : ${band}`;
                if (caStatus!==0) report+=`+${caStatus}CA`;

                const rssi = `${doc.wwan.signalStrength.rssi}dBm`;
                report += `\nRSSI : ${rssi}`;
                setParam("rssi", rssi);

                const plmn = doc.wwanadv.MCC + doc.wwanadv.MNC;
                report += `\nPLMN : ${plmn}`;
                setParam("plmn", plmn);

                const cellid = doc.wwanadv.cellId;
                const cellidhex = cellid.toString(16).toUpperCase();
                report += `\nCell ID : ${cellidhex} / ${cellid}`;
                setParam("cellidhex", cellidhex);
                setParam("cellid", cellid);

                if (mode === "WCDMA") {
                    const rscp = doc.wwan.signalStrength.rscp;
                    const ecio = doc.wwan.signalStrength.ecio;
                    report += `\nRSCP : ${rscp}dBm EC/IO : ${ecio}dB`;

                    setParam("rscp", `${rscp}dBm`); barGraph("rscp", rscp, -100, -70);
                    setParam("ecio", `${ecio}dB`); barGraph("ecio", ecio, -10, -2);

                    const psc = doc.wwanadv.primScode;
                    setParam("psc", psc);

                    const rnc = cellid >> 16;
                    const id = cellid & 0xffff;
                    setParam("rnc", rnc);

                    const nb = Math.floor(id / 10);
                    const cc = id - nb * 10;
                    setParam("nb", nb);
                    setParam("cc", cc);
                }
                else if (mode === "LTE") {
                    const rsrq = doc.wwan.signalStrength.rsrq;
                    const rsrp = doc.wwan.signalStrength.rsrp;
                    const sinr = doc.wwan.signalStrength.sinr;
                    report += `\nRSRQ/RSRP/SINR : ${rsrq}dB/${rsrp}dBm/${sinr}dB`;

                    setParam("rsrp", `${rsrp}dBm`); barGraph("rsrp", rsrp, -130, -60);
                    setParam("rsrq", `${rsrq}dB`); barGraph("rsrq", rsrq, -16, -3);
                    setParam("sinr", `${sinr}dB`); barGraph("sinr", sinr, 0, 24);

                    const pci = doc.wwanadv.primScode;
                    if (pci===-1) {
                        setVisible("lpci", false);
                    }
                    else {
                        setVisible("lpci", true, "inline");
                        setParam("pci", pci);
                    }

                    const enb = cellid >> 8;
                    const id = cellid & 0xff;
                    setParam("enb", enb);
                    setParam("cell", id);
                }

                const dl = doc.wwan.dataTransferredRx;
                const ul = doc.wwan.dataTransferredTx;

                const dlultime = new Date().getTime();

                if (history.dlultime!==0) {
                    const t = 1000 / (dlultime - history.dlultime);
                    const dlRate = history.dl===0 ? 0 : Math.floor((dl - history.dl) * t);
                    const ulRate = history.ul===0 ? 0 : Math.floor((ul - history.ul) * t);
                    const dlRateStr = formatBandwidth(dlRate);
                    const ulRateStr = formatBandwidth(ulRate);
                    report += `\nDownload : ${dlRateStr} Upload : ${ulRateStr}`;

                    setParam("dl", dlRateStr);
                    setParam("ul", ulRateStr);
                    barGraphDlUl("dlul", dlRate, ulRate);

                    history.dl = dl;
                    history.ul = ul;
                }

                history.dlultime = dlultime;

                console.log(report);
            }
        }
    });
}

function statusHeader() {
const header = `<style>
    #mode,
    #rssi,
    #plmn,
    #band,#ca,
    #cellidhex,#cellid,
    #nb,#cc,#rnc,#psc,
    #enb,#cell,#pci,
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
        <ul>
            <li>PLMN:<span id="plmn">#</span></li>
            <li>Band:<span id="band">#</span><span id="castat">+<span id="ca">#</span>CA</span></li>
        </ul>
        <ul>
            <li>Cell ID:<span id="cellidhex">#</span>/<span id="cellid">#</span></li>
        </ul>
        <ul id="u3g">
            <li>NB / Cell:<span id="nb">#</span>/<span id="cc">#</span></li>
            <li>RNC-ID:<span id="rnc">#</span></li>
            <li>SC:<span id="psc">#</span></li>
        </ul>
        <ul id="ulte">
            <li>eNB / Cell:<span id="enb">#</span>/<span id="cell">#</span></li>
            <li id="lpci">PCI:<span id="pci">#</span></li>
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
        </ul><div id="bdlul"></div>
    </div>
</div>`;
    document.body.insertAdjacentHTML("afterbegin", header);
    setInterval(currentBand, UPDATE_MS);
}

statusHeader();

})();
