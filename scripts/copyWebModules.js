/**
 * This script should be run from the root of where you run "yarn" from.
 */

const fs = require("fs");
const path = require("path");

const logPrefix = "[copyWebModules.js]";
const nodeModulePath = "./node_modules/bloom-player/dist";
const bloomPlayerAssetFolderPath = "./dist/bloom-player/";
const filesToNotCopy = [];

console.log(
    `${logPrefix}: Copying files from ${nodeModulePath} to ${bloomPlayerAssetFolderPath}`
);

const moduleFiles = fs.readdirSync(nodeModulePath);
const moduleFilesToCopy = moduleFiles.filter(
    (filename) => !filesToNotCopy.includes(filename)
);

rmSafe(bloomPlayerAssetFolderPath); // Clear out any outdated contents
mkdirSafe(bloomPlayerAssetFolderPath);

const assetBasenames = new Map();
const sourceExtensions = [".js"];
moduleFilesToCopy.forEach((filename) => {
    const fromFilename = filename;

    // Source extensions can't be directly bundled as assets
    // (the bundler can't deal with some JS files being source files and some being assets)
    // so rename something like "bloomplayer.js" to "bloomplayer.jsAsset"
    const extension = path.extname(filename);
    const newExtension = sourceExtensions.includes(extension)
        ? extension + "Asset"
        : extension;

    const basename = path.basename(filename, extension);
    const toFilename = path.join(
        path.dirname(filename),
        basename + newExtension
    );

    // Note: Each asset should have a unique basename (case insensitive).
    // Otherwise, when you do a cloud build in Expo, gradle will error out complaining about duplicate assets.
    // Yes, that happens for something like bloomplayer.htm and bloomPlayer.js (!!!),
    //even though they don't have identical filenames, and their basenames aren't even completely identical!
    const basenameCaseInsensitive = basename.toLowerCase();
    const fileInfo = {
        fromFilename,
        toFilename,
    };
    const collidingValue = assetBasenames.get(basenameCaseInsensitive);
    if (collidingValue !== undefined) {
        throw new Error(
            `Duplicate basename \"${basenameCaseInsensitive}\" (${collidingValue.fromFilename}, ${fileInfo.fromFilename}). ` +
                "Assets cannot share a basename or else gradle will throw duplicate asset errors during Cloud Build."
        );
    } else {
        assetBasenames.set(basenameCaseInsensitive, fileInfo);
    }

    fs.copyFileSync(
        `${nodeModulePath}/${fromFilename}`,
        `${bloomPlayerAssetFolderPath}/${toFilename}`
    );
});

function exportAssets() {
    const assetFilenames = Array.from(assetBasenames.values()).map(
        (fileInfo) => fileInfo.toFilename
    );

    const fileContents = `// This file is auto-generated by copyWebModules.js. To make permanent changes to it, modify copyWebModules.js
import { Asset } from "expo-asset";

export const bloomPlayerAssets = [
${assetFilenames
    .map((toFilename) => {
        return `\tAsset.fromModule(require("../../dist/bloom-player/${toFilename}")),`;
    })
    .join("\n")}
];`;

    // This path should be relative to where you run yarn from.
    const generatedCodeFileLocation = "src/autogenerated/BloomPlayerAssets.ts";
    console.log(
        `${logPrefix}: Adding BloomPlayer exports to ${generatedCodeFileLocation}`
    );
    fs.writeFileSync(generatedCodeFileLocation, fileContents);
}
exportAssets();

function rmSafe(path) {
    if (fs.existsSync(path)) {
        fs.rmSync(path, { recursive: true });
    }
}
function mkdirSafe(path) {
    if (!fs.existsSync(path)) fs.mkdirSync(path, { recursive: true });
}
