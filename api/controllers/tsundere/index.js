'use strict';

const HELPER_BASE = process.env.HELPER_BASE || '../../helpers/';
const Response = require(HELPER_BASE + 'response');

const config = {
  channelAccessToken: '【LINEアクセストークン】',
  channelSecret: '【LINEシークレット】',
};

const LineUtils = require(HELPER_BASE + 'line-utils');
const line = require('@line/bot-sdk');
const app = new LineUtils(line, config);

const deviceCredentials = require('【Googleアシスタントのデバイスクレデンシャルファイル】');

const CREDENTIALS = {
  client_id: deviceCredentials.client_id,
  client_secret: deviceCredentials.client_secret,
  refresh_token: deviceCredentials.refresh_token,
  type: "authorized_user"
};
const GoogleAssistant = require('./googleassistant');
const assistant = new GoogleAssistant(CREDENTIALS);

const misaka = require('./misaka.json');

const template = {
  name: "ウマ娘",
  image_width: 1080,
  image_height: 2220,
  base_range: { x: 417, y: 219, width: 251, height: 55, name: "タイトル", value: "ウマ娘詳細" },
  ranges: [
    { x: 521, y: 406, width: 529, height: 42, name: "馬名" },
    { x: 129, y: 546, width: 176, height: 36, name: "評価" },
    { x: 115, y: 665, width: 117, height: 40, name: "スピード" },
    { x: 316, y: 665, width: 117, height: 40, name: "スタミナ" },
    { x: 516, y: 665, width: 117, height: 40, name: "パワー" },
    { x: 716, y: 665, width: 117, height: 40, name: "根性" },
    { x: 916, y: 665, width: 117, height: 40, name: "賢さ" },
  ],
};

const { streamToBuffer } = require('@jorgeferrero/stream-to-buffer');
const TextDetection = require('./textdetection');

app.message(async (event, client) =>{
  console.log(event);

  if( event.message.type == 'text'){
    console.log(event.message.text);

    var response = await assistant.assist(event.message.text);
    var text = response.text;
    text = add_misaka(text);

    var message = app.createSimpleResponse(text)
    return client.replyMessage(event.replyToken, message);
  }else
  if( event.message.type == 'image'){
    var stream = await client.getMessageContent(event.message.id);
    var buffer = await streamToBuffer(stream);

    var result = await TextDetection.detection(buffer, template);
    console.log(result);

    var name = result.find( item => item.range.name == '馬名');
    var msg_str;
    if( name ){
      msg_str = "おめでとう！" + name.str;
      result.map( item =>{
        if (item.range.name != "馬名" )
          msg_str += "\n" + item.range.name + ": " + item.str;
      });
    }else{
      msg_str = "不明な画像です。";
    }
    var message = app.createSimpleResponse(msg_str);
    return client.replyMessage(event.replyToken, message);
  }
});

exports.handler = app.lambda();

function add_misaka(text) {
  var r1 = Math.floor(Math.random() * 2) + 1;
  var r2 = Math.floor(Math.random() * misaka.length);

  text += '、と'
  for (var i = 0; i < r1; i++)
    text += '御坂は';
  text += misaka[r2];

  return text;
}
