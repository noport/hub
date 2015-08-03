;(function() {

"use strict";

var isChannelReady;
var isStarted = false;
var localStream;
var pc;
var remoteStream;
var turnReady;
var remoteAudio = document.querySelector('#sound');

var pc_config = {'iceServers': [{'url': 'stun:stun.l.google.com:19302'}]};

var pc_constraints = {'optional': [{'DtlsSrtpKeyAgreement': true}]};
var sdpConstraints = {'mandatory': {
  'OfferToReceiveAudio':true,
  'OfferToReceiveVideo':true }};

var name = prompt('Enter your name:');
var role;
var socket = io.connect();
var performanceName;

var logger = document.querySelector('#log');

function log(text) {
  logger.value += text + '\n';
}

while (1) {
  role = prompt('Enter your role(Broadcaster, Performer, Guest):');
  role = role.toLowerCase();

  if (role !== 'broadcaster' && role !== 'performer' && role !== 'guest') {
    alert('Not valid input');
    continue;
  }

  if (role === 'broadcaster') {
    performanceName = prompt('Enter the name of the performance you want to start:');
  } else {
    performanceName = prompt('Enter the name of the performance you want to enter:');
  }

  console.log('New role: ' + role);
  socket.emit('enter', {role: role, name: name, performanceName: performanceName});
  break;
}

socket.on('log', function (array){
  for (var i = 0; i !== array.length; ++i) {
    log(array[i]);
  }
});


socket.on('created', function (performanceName){
  console.log('Start new performance ' + performanceName);
});


socket.on('join', function (performanceName){
  console.log('Another peer made a request to join performance ' + performanceName);
  console.log('This peer is the initiator of performance ' + performanceName + '!');
  isChannelReady = true;
  startToBroadcast();
});


socket.on('joined', function (room){
  console.log('This peer has joined room ' + room);
  isChannelReady = true;
});


socket.on('message', function (message){
  console.log('Client received message:', message);
  console.log(message.type);
  if (message === 'got user media') {
    startToBroadcast();
  } else if (message.type === 'offer') {
    if (role !== 'broadcaster' && !isStarted) {
      startToReceive();
    }
    pc.setRemoteDescription(new RTCSessionDescription(message));
    doAnswer();
  } else if (message.type === 'answer' && isStarted) {
    pc.setRemoteDescription(new RTCSessionDescription(message));
  } else if (message.type === 'candidate' && isStarted) {
    var candidate = new RTCIceCandidate({
      sdpMLineIndex: message.label,
      candidate: message.candidate
    });
    pc.addIceCandidate(candidate);
  } else if (message === 'bye' && isStarted) {
    handleRemoteHangup();
  }
});


function startToBroadcast() {
  if (!isStarted && isChannelReady) {
    createPeerConnection();
    isStarted = true;
    pc.addStream(localStream);
    doCall();
  }
}


function startToReceive() {
  if (!isStarted && isChannelReady) {
    createPeerConnection();
    isStarted = true;
  }
}


function sendMessage(message){
  console.log('Client sending message: ', message);
  socket.emit('message', message);
}


function createPeerConnection() {
  try {
    pc = new RTCPeerConnection(null);
    pc.onicecandidate = handleIceCandidate;
    pc.onaddstream = handleRemoteStreamAdded;
    pc.onremovestream = handleRemoteStreamRemoved;
    pc.oniceconnectionstatechange = function() {
      if (!isStarted) {
        return;
      }
      if(pc.iceConnectionState == 'disconnected') {
        console.log('Disconnected');
        hangup();
      }
    };
    console.log('Created RTCPeerConnnection');
  } catch (e) {
    console.log('Failed to create PeerConnection, exception: ' + e.message);
    alert('Cannot create RTCPeerConnection object.');
    return;
  }
}

function handleIceCandidate(event) {
  console.log('handleIceCandidate event: ', event);
  if (event.candidate) {
    sendMessage({
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate});
  } else {
    console.log('End of candidates.');
  }
}

function handleUserMedia(stream) {
  console.log('Adding local stream.');
  remoteAudio.src = window.URL.createObjectURL(stream);
  localStream = stream;
  sendMessage('got user media');
  startToBroadcast();
}

function handleUserMediaError(error){
  console.log('getUserMedia error: ', error);
}


if (role === 'broadcaster') {
  var constraints = {audio: true};
  getUserMedia(constraints, handleUserMedia, handleUserMediaError);
}


function handleRemoteStreamAdded(event) {
  console.log('Remote stream added.');
  remoteAudio.src = window.URL.createObjectURL(event.stream);
  remoteStream = event.stream;
}

function handleCreateOfferError(event){
  console.log('createOffer() error: ', e);
}

function doCall() {
  console.log('Sending offer to peer');
  pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
}

function doAnswer() {
  console.log('Sending answer to peer.');
  pc.createAnswer(setLocalAndSendMessage, null, sdpConstraints);
}

function setLocalAndSendMessage(sessionDescription) {
  // Set Opus as the preferred codec in SDP if Opus is present.
  sessionDescription.sdp = preferOpus(sessionDescription.sdp);
  pc.setLocalDescription(sessionDescription);
  console.log('setLocalAndSendMessage sending message' , sessionDescription);
  sendMessage(sessionDescription);
}

function requestTurn(turn_url) {
  var turnExists = false;
  for (var i in pc_config.iceServers) {
    if (pc_config.iceServers[i].url.substr(0, 5) === 'turn:') {
      turnExists = true;
      turnReady = true;
      break;
    }
  }
  if (!turnExists) {
    console.log('Getting TURN server from ', turn_url);
    // No TURN server. Get one from computeengineondemand.appspot.com:
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function(){
      if (xhr.readyState === 4 && xhr.status === 200) {
        var turnServer = JSON.parse(xhr.responseText);
        console.log('Got TURN server: ', turnServer);
        pc_config.iceServers.push({
          'url': 'turn:' + turnServer.username + '@' + turnServer.turn,
          'credential': turnServer.password
        });
        turnReady = true;
      }
    };
    xhr.open('GET', turn_url, true);
    xhr.send();
  }
}

function handleRemoteStreamRemoved(event) {
  console.log('Remote stream removed. Event: ', event);
}

function hangup() {
  console.log('Hanging up.');
  stop();
}

function handleRemoteHangup() {
  console.log('Session terminated.');
  stop();
}

function stop() {
  isStarted = false;
  // isAudioMuted = false;
  // isVideoMuted = false;
  pc.close();
  pc = null;
}

///////////////////////////////////////////

// Set Opus as the default audio codec if it's present.
function preferOpus(sdp) {
  var sdpLines = sdp.split('\r\n');
  var mLineIndex;
  // Search for m line.
  for (var i = 0; i < sdpLines.length; i++) {
    if (sdpLines[i].search('m=audio') !== -1) {
      mLineIndex = i;
      break;
    }
  }
  if (mLineIndex === null) {
    return sdp;
  }

  // If Opus is available, set it as the default in m line.
  for (i = 0; i < sdpLines.length; i++) {
    if (sdpLines[i].search('opus/48000') !== -1) {
      var opusPayload = extractSdp(sdpLines[i], /:(\d+) opus\/48000/i);
      if (opusPayload) {
        sdpLines[mLineIndex] = setDefaultCodec(sdpLines[mLineIndex], opusPayload);
      }
      break;
    }
  }

  // Remove CN in m line and sdp.
  sdpLines = removeCN(sdpLines, mLineIndex);

  sdp = sdpLines.join('\r\n');
  return sdp;
}

function extractSdp(sdpLine, pattern) {
  var result = sdpLine.match(pattern);
  return result && result.length === 2 ? result[1] : null;
}

// Set the selected codec to the first in m line.
function setDefaultCodec(mLine, payload) {
  var elements = mLine.split(' ');
  var newLine = [];
  var index = 0;
  for (var i = 0; i < elements.length; i++) {
    if (index === 3) { // Format of media starts from the fourth.
      newLine[index++] = payload; // Put target payload to the first.
    }
    if (elements[i] !== payload) {
      newLine[index++] = elements[i];
    }
  }
  return newLine.join(' ');
}

// Strip CN from sdp before CN constraints is ready.
function removeCN(sdpLines, mLineIndex) {
  var mLineElements = sdpLines[mLineIndex].split(' ');
  // Scan from end for the convenience of removing an item.
  for (var i = sdpLines.length-1; i >= 0; i--) {
    var payload = extractSdp(sdpLines[i], /a=rtpmap:(\d+) CN\/\d+/i);
    if (payload) {
      var cnPos = mLineElements.indexOf(payload);
      if (cnPos !== -1) {
        // Remove CN payload from m line.
        mLineElements.splice(cnPos, 1);
      }
      // Remove CN line in sdp
      sdpLines.splice(i, 1);
    }
  }

  sdpLines[mLineIndex] = mLineElements.join(' ');
  return sdpLines;
}

})();
