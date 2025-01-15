const WebSocket = require('ws');
const fs = require('fs');

const wss = new WebSocket.Server({ port: 8080 });

let recording_index = 0;
let dataSize = 0;  // Track the size of audio data

// WAV header parameters
// const sampleRate = 44100;  // 44.1 kHz
const sampleRate = 8000;  // 44.1 kHz
const numChannels = 2;     // Mono
const bitsPerSample = 32;  // 32-bit samples
const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
const blockAlign = numChannels * (bitsPerSample / 8);


let wavFilePath = "";

function writeWavHeader(fileStream, dataSize) {
  // RIFF header
  const riffHeader = Buffer.alloc(44);
  riffHeader.write('RIFF', 0);  // Chunk ID
  riffHeader.writeUInt32LE(36 + dataSize, 4);  // Chunk size (file size - 8)
  riffHeader.write('WAVE', 8);  // Format

  // fmt chunk
  riffHeader.write('fmt ', 12);  // Chunk ID
  riffHeader.writeUInt32LE(16, 16);  // fmt chunk size
  riffHeader.writeUInt16LE(1, 20);  // Audio format (1 = PCM)
  riffHeader.writeUInt16LE(numChannels, 22);  // Number of channels
  riffHeader.writeUInt32LE(sampleRate, 24);  // Sample rate
  riffHeader.writeUInt32LE(byteRate, 28);  // Byte rate
  riffHeader.writeUInt16LE(blockAlign, 32);  // Block align
  riffHeader.writeUInt16LE(bitsPerSample, 34);  // Bits per sample

  // data chunk
  riffHeader.write('data', 36);  // Chunk ID
  riffHeader.writeUInt32LE(dataSize, 40);  // Data chunk size

  // Write the header to the file
  fileStream.write(riffHeader);
}

console.clear();

wss.on('connection', (ws) => {
  console.log('ESP32 connected to WebSocket server.');
  wavFilePath = "audio_stream_" + sampleRate.toString() + "_" + numChannels.toString() + "_" + bitsPerSample.toString() + "_" + recording_index.toString() + ".wav";
  const fileStream = fs.createWriteStream(wavFilePath, { flags: 'w' });
  
  // Write the WAV header initially
  writeWavHeader(fileStream, dataSize);
  var start_time = 0;
  var first_msg_time = 0;
  var number_of_msgs = 0;
  dataSize = 0;
  ws.on('message', (message) => {
    number_of_msgs++;
    if (Buffer.isBuffer(message)) {
      // Append the audio data to the file
      if (dataSize == 0) {
        first_msg_time = Date.now();
      }
      fileStream.write(message);
      // Update data size
      dataSize += message.length;
      
      var speed = 8* message.length/(Date.now() - start_time); // kbps
      var avg_speed = 8* dataSize/(Date.now() - first_msg_time); // kbps
      console.clear();
      console.log(" moment speed \t\t%d kbps\n avg speed \t\t%d kbps\n avg msg length \t%d\n num msgs \t\t %d",speed, avg_speed, dataSize/number_of_msgs, number_of_msgs);      
      start_time = Date.now();
    } else {
      console.log('Received non-binary message');
    }
  });

  ws.on('close', () => {
    console.log('ESP32 disconnected from WebSocket server');
    fileStream.end();

    // After the connection is closed, update the WAV header with the correct data size and file size
    const fileStats = fs.statSync(wavFilePath);
    const finalFileSize = fileStats.size;
    const finalDataSize = finalFileSize - 44;  // Exclude header size

    const updatedHeader = Buffer.alloc(44);
    updatedHeader.write('RIFF', 0);
    updatedHeader.writeUInt32LE(36 + finalDataSize, 4);  // Update total file size
    updatedHeader.write('WAVE', 8);
    updatedHeader.write('fmt ', 12);
    updatedHeader.writeUInt32LE(16, 16);
    updatedHeader.writeUInt16LE(1, 20);
    updatedHeader.writeUInt16LE(numChannels, 22);
    updatedHeader.writeUInt32LE(sampleRate, 24);
    updatedHeader.writeUInt32LE(byteRate, 28);
    updatedHeader.writeUInt16LE(blockAlign, 32);
    updatedHeader.writeUInt16LE(bitsPerSample, 34);
    updatedHeader.write('data', 36);
    updatedHeader.writeUInt32LE(finalDataSize, 40);  // Update data chunk size

    // Write the updated header to the file
    const fd = fs.openSync(wavFilePath, 'r+');
    fs.writeSync(fd, updatedHeader, 0, 44, 0);  // Write updated header at the start
    fs.closeSync(fd);
    recording_index++;
    console.log('WAV file updated with final header and data size');
  });
});

console.log('WebSocket server running on ws://localhost:8080');
