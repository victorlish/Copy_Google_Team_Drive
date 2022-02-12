'use strict';
const fs = require("fs");
const { spawn } = require('child_process');
const { EOL } = require('os');
const pendingDL = "list.txt"
const original_config = "rclone.conf";
const modified_config = "rclone_modified.conf";
const rclonePath = "rclone";		// Change the rclonePath if rclone is not in the system path
const retriesBeforeExit = 5;		// Retries of the progress

var token = null;
var tokenExpTime = null;
function readTokenFromOriginalConfig() {
	try {
		let configContent = fs.readFileSync(original_config, { encoding: "utf-8" }).split(/\r?\n/);
		for (let i = 0; i < configContent.length; i++) {
			if (configContent[i].startsWith("token = ")) {
				token = configContent[i].replace("token = ", "");
				tokenExpTime = Date.parse(JSON.parse(token).expiry)
			}
		}
	} catch (e) {
		console.log(">>>------ Encountered error while trying to read the token:\n>>>------ " + e);
	}

	if (token != null) {
		readpendingDL();
		if (!errorParsingPendingDL && folderIDList.length != 0) {
			console.log(">>>------ Start");
			downloadFile(0);
		}
	}
}

var folderIDList = [];
var destinationList = [];
var errorParsingPendingDL = false;
function readpendingDL() {
	try {
		let pendingDLContent = fs.readFileSync(pendingDL, { encoding: "utf-8" }).split(/\r?\n/);
		for (let i = 0; i < pendingDLContent.length; i++) {
			if (pendingDLContent[i] != "") {
				let array = pendingDLContent[i].split("===");
				if (array.length != 2) {
					console.log(">>>------ Encountered error while parsing this line:\n>>>------ " + pendingDLContent[i]);
					errorParsingPendingDL = true;
				} else {
					folderIDList.push(array[0]);
					destinationList.push(array[1]);
				}
			}
		}
	} catch (e) {
		console.log(">>>------ Encountered error while trying to read the file list:\n>>>------ " + e);
		errorParsingPendingDL = true;
	}
}

var downloadRetries = 0;
function downloadFile(index) {
	console.log(">>>------ Copying Folder from " + folderIDList[index] + " to " + destinationList[index]);
	if (fs.existsSync(modified_config))
		fs.unlinkSync(modified_config)
	fs.copyFileSync(original_config, modified_config);
	fs.appendFileSync(modified_config, EOL + 
		"[tmp]" + EOL +
		"type = drive" + EOL +
		"scope = drive" + EOL +
		"root_folder_id = " + folderIDList[index] + EOL +
		"token = " + token + EOL
		);

	//create rclone process
	const rclone = spawn(rclonePath, ["--drive-server-side-across-configs", "--config", modified_config, "-P", "copy", "tmp:", destinationList[index]], { stdio: 'inherit' });

	rclone.on('close', (code) => {
		readTokensFromModifiedConfig();
		console.log(">>>------ Child process exited with code " + code);
		if (code != 0) {
			if (downloadRetries < retriesBeforeExit) {
				downloadRetries++;
				downloadFile(index);
			} else {
				console.log(">>>------ Encountered an error.");
			}
		} else if (index + 1 == folderIDList.length) {
			console.log(">>>------ Finished.");
		} else {
			downloadRetries = 0;
			downloadFile(index + 1);
		}
	});
}

function readTokensFromModifiedConfig() {
	try {
		let modifiedConfigContent = fs.readFileSync(modified_config, { encoding: "utf-8" }).split(/\r?\n/);
		for (let i = 0; i < modifiedConfigContent.length; i++) {
			if (modifiedConfigContent[i].startsWith("token = ")) {
				let tmp_token = modifiedConfigContent[i].replace("token = ", "");
				let tmp_tokenExpTime = Date.parse(JSON.parse(tmp_token).expiry)
				if (token != tmp_token && tmp_tokenExpTime > tokenExpTime) {
					let originalConfigFileContent = fs.readFileSync(original_config, { encoding: "utf-8" });
					originalConfigFileContent = originalConfigFileContent.replace(token, tmp_token);
					fs.writeFileSync(original_config, originalConfigFileContent);
					token = tmp_token;
				}
			}
		}
	} catch (e) {
		console.log(">>>------ Encountered error trying to read token:\n>>>------ " + e);
	}
}

readTokenFromOriginalConfig();