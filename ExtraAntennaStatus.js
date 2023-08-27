// ==UserScript==
// @name         Huawei Extra Antenna Status dashboard
// @namespace    http://github.com/Postrediori/HuaweiMobileDashboard
// @version      0.2
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

function getDocument(data, type) {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(data, type);
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
 * Convert string with XML into Document object
 * @param {String} data String with XML data
 * @returns Document object or null
 */
function getXMLDocument(data) {
    return getDocument(data, "application/xml");
}

/**
 * Convert string with HTML into Document object
 * @param {String} data String with HTML data
 * @returns Document object or null
 */
function getHTMLDocument(data) {
    return getDocument(data, "text/html");
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
 * Get csrf_token of the session from meta tags
 * @param {String} String with HTML data
 * @returns String with csrf_token or null
 */
function getDocumentCsrfToken(data) {
    var doc = getHTMLDocument(data);
    if (!doc) {
        console.log("Error:Cannot get Web UI page");
        return null;
    }

    var token = null;
    var metaTags = doc.getElementsByTagName("meta");
    for (const tag of metaTags) {
        if (tag.getAttribute("name") === "csrf_token") {
            var tokenAttribute = tag.getAttribute("content");
            if (tokenAttribute) {
                token = tokenAttribute;
                break;
            }
        }
    }

    return token;
}

/**
 * Get error code from response data
 * @param {String} data XMLDocument with XML response
 * @returns Error code or zero in case operation was successfull
 */
function getResponseStatus(doc) {
    var tags = doc.getElementsByTagName("response");
    if (tags.length>0 && tags[0].innerHTML === "OK") {
        return 0;
    }
    else {
        var errtags = doc.getElementsByTagName("error");
        if (errtags.length>0) {
            var err = {};
            for (const t of errtags[0].children) {
                err[t.nodeName] = t.innerHTML;
            }
            console.log("Error: Received responce with error:", err);
        }
        else {
            console.log("Error: Received responce with unknown status");
        }
        return 1;
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
        console.log("Network mode set to", mode);

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

                var report = `Network mode : ${currentMode}`;
                setParam("mode", currentMode);
                setMode(currentMode);

                const rssi = extractXML("rssi", doc);
                report += `\nRSSI : ${rssi}`;

                setParam("rssi", rssi);

                if (mode === "WCDMA") {
                    const rscp = extractXML("rscp",doc);
                    const ecio = extractXML("ecio",doc);
                    report += `\nRSCP : ${rsrq} EC/IO : ${ecio}`;
                    
                    setParam("rscp", rscp);
                    setParam("ecio", ecio);
                }
                else if (mode === "LTE") {
                    const rsrq = extractXML("rsrq",doc);
                    const rsrp = extractXML("rsrp",doc);
                    const sinr = extractXML("sinr",doc);
                    report += `\nRSRQ/RSRP/SINR : ${rsrq}/${rsrp}/${sinr}`;
                    
                    setParam("rsrp", rsrp);
                    setParam("rsrq", rsrq);
                    setParam("sinr", sinr);
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

function ltebandselection(e) {
    var band = prompt("Please input desirable LTE band number. " +
        "If you want to use multiple LTE bands, write down multiple band number joined with '+'." +
        "If you want to use every supported bands, write down 'ALL'. (e.g. 3+7 / 1+3 / 1+3+8)." +
        "Leave this empty to leave as is.", "ALL");
    if (band==null || band==="") {
        console.log("No band selected");
        return;
    }

    var lteFlags;
    if(band.toUpperCase()==="ALL") {
        lteFlags = "7FFFFFFFFFFFFFFF";
    }
    else {
        var bandList = band.split('+');
        var flags = 0;
        for (const bandId of bandList) {
            flags = flags + Math.pow(2, parseInt(bandId)-1);
        }
        lteFlags = flags.toString(16);
    }
    console.log("LTE Band Flags:", lteFlags);

    $.ajax({
        type:"GET",
        async: true,
        url: '/html/home.html',
        error: function(request,status,error){
            console.log("Token Error:", request.status, "\nmessage:", request.responseText, "\nerror:", error);
        },            
        success: function(data){
            var token = getDocumentCsrfToken(data);
            if (!token) {
                console.log("Error: Web UI page is not logged in");
                return;
            }

            setTimeout(function() {
                $.ajax({
                    type: "POST",
                    async: true,
                    url: '/api/net/net-mode',
                    headers: {'__RequestVerificationToken':token},
                    contentType: 'application/xml',
                    data: `<request><NetworkMode>03</NetworkMode><NetworkBand>3FFFFFFF</NetworkBand><LTEBand>${lteFlags}</LTEBand></request>`,
                    success: function(nd){
                        // It may be either string or XMLDocument here
                        var doc = null;
                        if (typeof(nd)==="string" || nd instanceof String) {
                            doc = getXMLDocument(nd);
                        }
                        else {
                            doc = nd;
                        }

                        var status = getResponseStatus(doc);
                        if (status === 0) {
                            console.log("Network mode set successfully");
                        }
                        else {
                            console.log("Error while setting band list");
                        }
                    },
                    error: function(request,status,error){
                        console.log("Net Mode Error:", request.status, "\nmessage:", request.responseText, "\nerror:", error);
                    }
                });
            }, UPDATE_MS);
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

    #setband {
        font-weight:bolder;
        background-color: #448;
        color:white;
        padding: 10px;
        border-radius:10px;
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
    <div class="f">
        <ul>
            <li style="margin-right: 0px;"><a id="setband" href="#">Force 4G Bands</a></li>
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
    document.getElementById("setband").addEventListener (
        "click", ltebandselection, false
    );
}

statusHeader();
setInterval(currentBand, UPDATE_MS);

})();
