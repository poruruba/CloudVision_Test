'use strict';

const path = require('path');
const grpc = require('grpc');
const protoFiles = require('google-proto-files');
const { GoogleAuth, UserRefreshClient } = require('google-auth-library');

const PROTO_ROOT_DIR = protoFiles.getProtoPath('..');
const embedded_assistant_pb = grpc.load({
    root: PROTO_ROOT_DIR,
    file: path.relative(PROTO_ROOT_DIR, protoFiles.embeddedAssistant.v1alpha2)
}).google.assistant.embedded.v1alpha2;

class GoogleAssistant {
    constructor(credentials) {
        GoogleAssistant.prototype.endpoint_ = "embeddedassistant.googleapis.com";
        this.client = this.createClient_(credentials);
        this.locale = "ja-JP";
        this.deviceModelId = 'default';
        this.deviceInstanceId = 'default';
    }
    createClient_(credentials) {
        const sslCreds = grpc.credentials.createSsl();
        // https://github.com/google/google-auth-library-nodejs/blob/master/ts/lib/auth/refreshclient.ts
        const auth = new GoogleAuth();
        const refresh = new UserRefreshClient();
        refresh.fromJSON(credentials, function (res) { });
        const callCreds = grpc.credentials.createFromGoogleCredential(refresh);
        const combinedCreds = grpc.credentials.combineChannelCredentials(sslCreds, callCreds);
        const client = new embedded_assistant_pb.EmbeddedAssistant(this.endpoint_, combinedCreds);
        return client;
    }

    assist(input, encode) {
        const config = new embedded_assistant_pb.AssistConfig();
        config.setTextQuery(input);
        config.setAudioOutConfig(new embedded_assistant_pb.AudioOutConfig());
        if( encode == undefined )
	        config.getAudioOutConfig().setEncoding(2); // 1: LINEAR16, 2: MP3
	    else
	        config.getAudioOutConfig().setEncoding(encode); // 1: LINEAR16, 2: MP3
        config.getAudioOutConfig().setSampleRateHertz(16000);
        config.getAudioOutConfig().setVolumePercentage(100);
        config.setDialogStateIn(new embedded_assistant_pb.DialogStateIn());
        config.setDeviceConfig(new embedded_assistant_pb.DeviceConfig());
        config.getDialogStateIn().setLanguageCode(this.locale);
        config.getDeviceConfig().setDeviceId(this.deviceInstanceId);
        config.getDeviceConfig().setDeviceModelId(this.deviceModelId);
        const request = new embedded_assistant_pb.AssistRequest();
        request.setConfig(config);

        delete request.audio_in;
        
        var output_buffer;
        if( encode != undefined )
	        output_buffer = Buffer.alloc(0);
        
        const conversation = this.client.assist();
        return new Promise((resolve, reject) => {
            let response = { input: input };
            conversation.on('data', (data) => {
//            	console.log(JSON.stringify(data));
                if (data.device_action) {
                    response.deviceAction = JSON.parse(data.device_action.device_request_json);
                } else if (data.dialog_state_out !== null && data.dialog_state_out.supplemental_display_text) {
                    response.text = data.dialog_state_out.supplemental_display_text;
                }
                
                if( data.audio_out && output_buffer ){
                	console.log(data.audio_out.audio_data);
                	output_buffer = Buffer.concat([output_buffer, data.audio_out.audio_data]);
                }
            });
            conversation.on('end', (error) => {
                // Response ended, resolve with the whole response.

				if( output_buffer ){
					response.audio = output_buffer.toString('base64');
//					console.log("output_buffer=" + output_buffer.length);
				}

                resolve(response);
            });
            conversation.on('error', (error) => {
//                console.error(error);
                reject(error);
            });
            conversation.write(request);
            conversation.end();
        });
    }
}

module.exports = GoogleAssistant;
