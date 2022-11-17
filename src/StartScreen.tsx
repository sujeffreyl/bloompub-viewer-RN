import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View, Image } from 'react-native';

export const StartScreen: React.FunctionComponent<{}> = (props) => {
  return (
    <View style={styles.startScreen}>
        <Image style={styles.logo} source={require('../assets/wordmark.png')} />
      {/* <div
        css={css`
          margin-left: auto;
          margin-right: auto;
          margin-top: 60px;
        `}
      >
        <img
          src={wordmark}
          css={css`
            width: 455px;
          `}
        />

        <div
          className={"choices"}
          css={css`
            margin-top: 20px;
            a {
              display: flex;
              color: #d65649;
              font-size: 24px;
              //text-decoration: underline;
              cursor: pointer;
              img {
                width: 30px;
                margin-right: 15px;
              }
            }
          `}
        >
          <a onClick={() => showOpenFile()}>
            <img src={open} css={css``} />
            Choose BloomPUB book on this computer
          </a>
          <br />
          <a
            onClick={() => {
              window.electronApi.openLibrary();
            }}
          >
            <img src={search} css={css``} />
            Get BloomPUB books on BloomLibrary.org
          </a>
        </div>
      </div> */}
    </View>
  );
};

const styles = StyleSheet.create({
    startScreen: {
        display: "flex",
        marginLeft: "auto",
        marginRight: "auto",
        marginTop: 60,
    },
    logo: {
        width: 255,
        height: 100,
        resizeMode: 'contain',
    }
});
  