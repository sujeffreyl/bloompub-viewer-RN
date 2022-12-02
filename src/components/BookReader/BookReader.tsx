import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as FileSystem from "expo-file-system";
import * as React from "react";
import { FunctionComponent, useEffect, useState } from "react";
import {
    ActivityIndicator,
    NativeSyntheticEvent,
    Platform,
    StyleSheet,
    Text,
} from "react-native";
import { WebView } from "react-native-webview";
import { WebViewMessage } from "react-native-webview/lib/WebViewTypes";
import { bloomPlayerAssets } from "../../autogenerated/BloomPlayerAssets";
import { Colors } from "../../constants/Colors";
import { RootStackParamList } from "../../navigationTypes";
import { openBookForReading, OPEN_BOOK_DIR } from "../../storage/BookStorage";
import * as ErrorLog from "../../util/ErrorLog";
import { copyAssetAsync } from "../../util/FileUtil";

interface BookReaderProps {
    bloomPubPath: string;
    navigation: NativeStackNavigationProp<
        RootStackParamList,
        "Read",
        "PUBViewer"
    >;
}

const BLOOM_PLAYER_FOLDER = FileSystem.cacheDirectory + "bloomPlayer";
const BLOOM_PLAYER_PATH = `${BLOOM_PLAYER_FOLDER}/bloomplayer.htm`;

export const BookReader: FunctionComponent<BookReaderProps> = (props) => {
    const [isBloomPlayerReady, setIsBloomPlayerReady] = useState(false);
    const [uri, setUri] = useState("");

    const [error, setError] = useState<string | null>(null);

    //console.log('in BookReader');

    // Enhance: We only do the loadBloomPlayer useEffect once per component,
    // but every time we re-navigate to the Read screen, this will re-run. (I guess it's a new component?)
    // It'd be nice if it only ran once each time the app was opened.

    // Load Bloom Player assets
    useEffect(() => {
        // Copy Bloom Player from dist to cache
        // Both Android and iOS need this for separate reasons
        // Android:
        //   react-native-webview has a bug on Android where local URI sources print out the HTML as text instead of as HTML
        //   (See https://github.com/react-native-webview/react-native-webview/issues/428 and https://github.com/react-native-webview/react-native-webview/issues/518)
        //   To work around it, we copy the HTM from dist into an HTM in the cache folder,
        //   then point to the HTM path in the cache folder.
        // iOS
        //   Because of Webview's allowingReadAccessToURL prop,
        //   we want both Bloom Player and the book to be under the same directory, so we copy Bloom Player to the cache directory.
        const loadBloomPlayerAsync = async () => {
            // Clearing the Bloom Player folder is optional in production,
            // but useful in development to ensure we're starting from a clean folder.
            await FileSystem.deleteAsync(BLOOM_PLAYER_FOLDER, {
                idempotent: true,
            });
            await ensureBPFolderAsync();
            const copyPromises = bloomPlayerAssets.map((asset) => {
                const extension = asset.type === "jsAsset" ? "js" : asset.type;
                const destination = `${BLOOM_PLAYER_FOLDER}/${asset.name}.${extension}`;

                return copyAssetAsync({
                    asset,
                    to: destination,
                });
            });

            // ENHANCE: catch if Promise.all rejects.
            await Promise.all(copyPromises);

            setIsBloomPlayerReady(true);
        };
        loadBloomPlayerAsync();
    }, []);

    useEffect(() => {
        // Unzip .bloompub and get the path to the HTM file inside the .bloompub
        const loadBookAsync = async () => {
            const unzippedBookFolderPath = await openBookForReading(
                props.bloomPubPath
            );
            if (unzippedBookFolderPath === "failed") {
                setError("Failed to unzip book");
                return;
            }
            console.log("unzippedbook at: " + unzippedBookFolderPath);

            const directoryContents = await FileSystem.readDirectoryAsync(
                "file://" + unzippedBookFolderPath
            );
            const htmFiles = directoryContents.filter((filename) =>
                filename.endsWith(".htm")
            );
            if (htmFiles.length === 0) {
                setError("Couldn't find any HTM files in book");
            }
            const htmFilename = htmFiles[0];
            console.log("bookHtmPath: " + htmFilename);

            // iOS doesn't read filenames with space, by default.
            const newBookFilename =
                Platform.OS === "ios"
                    ? htmFilename.replace(/ /g, "%20")
                    : htmFilename;

            return newBookFilename;
        };

        const setUriFromBookHtmPath = (bookHtmPath: string | undefined) => {
            if (!bookHtmPath) {
                return;
            }

            const encodedPath = encodeURI(`${OPEN_BOOK_DIR}/${bookHtmPath}`);

            // Additional params that might possibly be useful, or might not
            // &useOriginalPageSize=true&allowToggleAppBar=true&lang=en&hideFullScreenButton=false
            const newUri = `${BLOOM_PLAYER_PATH}?url=${encodedPath}&centerVertically=true&showBackButton=true&independent=false&host=bloompubviewer`;

            console.log("Read uri: " + newUri);
            setUri(newUri);
        };

        loadBookAsync().then(setUriFromBookHtmPath);
    }, [props.bloomPubPath]);

    function onMessageReceived(event: NativeSyntheticEvent<WebViewMessage>) {
        try {
            if (!event.nativeEvent || !event.nativeEvent.data) {
                // At startup we get a completely spurious
                // message, the source of which I have not been able to track down.
                // However, since it doesn't have any data format we expect, we can easily ignore it.
                return;
            }

            const data = JSON.parse(event.nativeEvent.data);
            switch (data.messageType) {
                // case "sendAnalytics":
                //     onAnalyticsEvent(data);
                //     break;
                case "logError":
                    ErrorLog.logError({
                        logMessage: data.message,
                    });
                    break;
                // case "requestCapabilities":
                //     this.webview!.postMessage(
                //         JSON.stringify({
                //             messageType: "capabilities",
                //             canGoBack: true,
                //         })
                //     );
                //     break;
                case "backButtonClicked":
                    props.navigation.goBack();
                    break;
                // case "bookStats":
                //     onBookStats(data);
                //     break;
                // case "pageShown":
                //     onPageShown(data);
                //     break;
                // case "audioPlayed":
                //     onAudioPlayed(data);
                //     break;
                // case "videoPlayed":
                //     onVideoPlayed(data);
                //     break;
                default:
                    ErrorLog.logError({
                        logMessage:
                            "BookReader.onMessageReceived() does not understand the messageType on this event: " +
                            JSON.stringify(event, getStringifyReplacer()),
                    });
            }

            // Next step: should also handle message type storePageData. The data object will also
            // have a key and a value, both strings. We need to store them somewhere that will
            // (at least) survive rotating the phone, and ideally closing and re-opening the book;
            // but it should NOT survive downloading a new version of the book. Whether there's some
            // other way to get rid of it (for testing, or for a new reader) remains to be decided.
            // Once the data is stored, it needs to become part of the reader startup to give it
            // back to the reader using window.sendMessage(). BloomPlayer is listening for a message
            // with messageType restorePageData and pageData an object whose fields are the key/value
            // pairs passed to storePageData. See the event listener in boom-player's externalContext
            // file.
        } catch (e) {
            ErrorLog.logError({
                logMessage:
                    "BookReader.onMessageReceived() does not understand this event: " +
                    event.nativeEvent.data,
            });
        }
    }

    // function onAudioPlayed(data: any) {
    //     const duration = data.duration;
    //     this.totalAudioDuration += duration;
    //     if (!this.reportedAudioOnCurrentPage) {
    //         this.reportedAudioOnCurrentPage = true;
    //         this.audioPages++;
    //     }
    // }

    // function onVideoPlayed(data: any) {
    //     const duration = data.duration;
    //     this.totalVideoDuration += duration;
    //     if (!this.reportedVideoOnCurrentPage) {
    //         this.reportedVideoOnCurrentPage = true;
    //         this.videoPages++;
    //     }
    // }

    // function onPageShown(data: any) {
    //     this.lastNumberedPageWasRead =
    //         this.lastNumberedPageWasRead || data.lastNumberedPageWasRead;
    //     this.totalPagesShown++;
    //     this.reportedAudioOnCurrentPage = this.reportedVideoOnCurrentPage = false;
    // }

    // function onBookStats(data: any) {
    //     this.totalNumberedPages = data.totalNumberedPages;
    //     this.questionCount = data.questionCount;
    //     this.contentLang = data.contentLang;
    //     var book = this.book();
    //     if (book.bloomdVersion === 0) {
    //         // the only feature that I expect might already be known is talkingBook; this is figured out
    //         // mainly based on the existence of audio files while attempting to read features from meta.json.
    //         // However, in debugging I've encountered a case where 'blind' was also listed. So using indexOf
    //         // is safest.
    //         const isTalkingBook =
    //             book.features.indexOf(BookFeatures.talkingBook) >= 0;
    //         // Now that we have the information from the player parsing the book, we can update
    //         // some other features that it figures out for legacy books.
    //         // Note: the order of features here matches Bloom's BookMetaData.Features getter,
    //         // so the features will be in the same order as when output from there.
    //         // Not sure whether this matters, but it may make analysis of the data easier.
    //         book.features = [];
    //         if (data.blind) {
    //             book.features.push(BookFeatures.blind);
    //         }
    //         if (data.signLanguage) {
    //             book.features.push(BookFeatures.signLanguage);
    //         }
    //         if (isTalkingBook) {
    //             book.features.push(BookFeatures.talkingBook);
    //         }
    //         if (data.motion) {
    //             book.features.push(BookFeatures.motion);
    //         }
    //     }
    //     var args = {
    //         title: book.title,
    //         totalNumberedPages: this.totalNumberedPages,
    //         questionCount: this.questionCount,
    //         contentLang: this.contentLang,
    //         features: book.features.join(","),
    //         sessionId: this.sessionId,
    //         brandingProjectName: book.brandingProjectName,
    //     };
    //     if (!book.brandingProjectName) {
    //         delete args.brandingProjectName;
    //     }
    //     BRAnalytics.reportLoadBook(args);
    // }

    // // Handle an anlytics event. data is the result of parsing the json received
    // // in the message. It should have properties event and params, the analytics
    // // event to track and the params to send.
    // function onAnalyticsEvent(data: any) {
    //     try {
    //         const eventName = data.event;
    //         const params = data.params;
    //         if (eventName === "comprehension") {
    //             // special case gets converted to match legacy comprehension question analytics
    //             BRAnalytics.track("Questions correct", {
    //                 questionCount: params.possiblePoints,
    //                 rightFirstTime: params.actualPoints,
    //                 percentRight: params.percentRight,
    //                 title: this.book().title,
    //             });
    //         } else {
    //             params.title = this.book().title;
    //             BRAnalytics.track(eventName, params);
    //         }
    //     } catch (ex) {
    //         ErrorLog.logError({
    //             logMessage: "BookReader.onAnalyticsEvent error: " + ex,
    //         });
    //     }
    // }

    const isLoading = uri === "" || !isBloomPlayerReady;

    const postMessageWorkaroundJavascript = `
window.postMessage = function(data) {
    window.ReactNativeWebView.postMessage(data);
};`;

    return (
        <>
            {error ? (
                <Text>Error: {error}</Text>
            ) : (
                <>
                    {isLoading ? (
                        <ActivityIndicator color={Colors.bloomRed} />
                    ) : (
                        <WebView
                            style={styles.webViewStyles}
                            source={{ uri }}
                            injectedJavaScript={
                                postMessageWorkaroundJavascript +
                                "\ntrue; // note: this is required, or you'll sometimes get silent failures"
                            }
                            scalesPageToFit={true}
                            automaticallyAdjustContentInsets={false}
                            javaScriptEnabled={true}
                            allowFileAccess={true} // Needed for Android to access the bloomplayer.htm in cache dir
                            allowFileAccessFromFileURLs={true} // Needed to load the book's HTM. allowUniversalAccessFromFileURLs is fine too.
                            originWhitelist={["*"]} // Some widgets need this to load their content
                            // allowingReadAccessToURL is an iOS only prop.
                            // At a high level, under many conditions, file:// requests other than the {source URI} won't work unless its path or a parent directory path
                            // is granted explicit access via allowingReadAccessToURL
                            // If the source is a file:// URI
                            //    If this prop is NOT specified, then Webkit (iOS) only gives access to the source URI by default.
                            //    If this prop IS specified, then Webkit (iOS) gives access to the path specified by this prop
                            //       Beware: It seems that if Source URI is not under this path, then the Source URI won't be loaded at all!
                            // If the source is a http:// URI
                            //    It seems that no file:// URI's can be loaded, regardless of what allowingReadAccessToUrl says
                            //    During development, the assets are served via http:// to the development machine,
                            //       so using a mix of http:// for Bloom Player and file:// for the book is highly problematic!
                            //       An easy way to resolve this is to serve Bloom Player via file:// from the cache directory, same as the book.
                            allowingReadAccessToURL={FileSystem.cacheDirectory!}
                            onMessage={onMessageReceived}
                            //
                            // BloomReader-RN used these, but not sure if they're needed or not
                            // domStorageEnabled={true}
                            // mixedContentMode="always"
                            // allowUniversalAccessFromFileURLs={true}
                        />
                    )}
                </>
            )}
        </>
    );
};

const styles = StyleSheet.create({
    webViewStyles: {
        flex: 1,
    },
});

async function ensureBPFolderAsync() {
    return FileSystem.makeDirectoryAsync(BLOOM_PLAYER_FOLDER, {
        intermediates: true,
    });
}
export default BookReader;
