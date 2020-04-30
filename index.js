'use strict';

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');
const {dialogflow, SignIn, NewSurface} = require('actions-on-google');

admin.initializeApp();
const db = admin.firestore();

const CLIENT_ID = "Your Google Client ID"; 

const i18n = {
  "en": {
    "START_OK": "I started the timer",
    "START_ERROR": "Oops, I couldn't start the timer",
    "START_NO_WID": "I failed starting the timer",
    "STOP_OK": "I stopped the timer",
    "STOP_ERROR": "I couldn't stop the timer",
    "STOP_NO_TIMER": "There is no timer acutally running",
    "CONTEXT_SIGN_IN": "In order to save your key",
    "SIGN_IN_REFUSED": "Ok, let's do it next time",
    "NO_SCREEN": "You need a screen device to enter your API key",
    "HAS_SCREEN_NOTIFICATION": "Enter your Toggl API key in order to start or stop a timer",
    "HAS_SCREEN_CONTEXT": "Now your Toggl API key is needed to complete your account configuration",
    "HAS_SCREEN_SWITCH_SUCCESFUL": "Please enter your Toggl API key",
    "HAS_SCREEN_SWITCH_FAILED": "You need a screen device to enter your API key, once your account configuration is over, you can use Toggl Go with your voice",
    "ON_SCREEN": "Now your Toggl API key is needed to complete your account configuration",
    "API_KEY_GIVEN": "Great, let me save that"
  },
  "fr": {
    "START_OK": "Je viens de lancer le timer",
    "START_ERROR": "Oups, je n'ai pas pu lancer le timer",
    "START_NO_WID": "Je n'ai pas réussi à lancer le timer",
    "STOP_OK": "Je viens d'arrêter le timer",
    "STOP_ERROR": "Oups, je n'ai pas pu arrêter le timer",
    "STOP_NO_TIMER": "Il me semble qu'aucun timer n'est en cours",
    "CONTEXT_SIGN_IN": "Pour stocker votre clé API Toggl",
    "SIGN_IN_REFUSED": "Très bien, faisons cela une prochaine fois.",
    "NO_SCREEN": "Il faut un appareil avec écran pour entrer votre clé API Toggl",
    "HAS_SCREEN_NOTIFICATION": "Ecrivez votre clé API Toggl pour pouvoir lancer ou arrêter un timer",
    "HAS_SCREEN_CONTEXT": "Maintenant, j'ai besoin de votre clé API Toggl afin de finir la configuration de votre compte",
    "HAS_SCREEN_SWITCH_SUCCESFUL": "Merci d'entrer votre clé API Toggl pour lancer ou arrêter un timer",
    "HAS_SCREEN_SWITCH_FAILED": "Il faut un appareil avec écran pour entrer votre clé API Toggl, une fois votre compte configuré vous n'aurez plus besoin d'un appareil avec écran",
    "ON_SCREEN": "Maintenant, j'ai besoin de votre clé API Toggl afin de finir la configuration de votre compte",
    "API_KEY_GIVEN": "Super, je sauvegarde votre clé Toggl",
  }
};

function getAPIKey(conv) {
  return new Promise(function(resolve, reject) {
    if (conv.data.apikey)
      resolve(conv.data.apikey);
    if (!conv.user.profile.payload)
      resolve(null);

    const uid = conv.user.profile.payload.sub;
    db.collection('togglgo').doc(uid).get().then((doc) => {
      if (doc.exists) {
        conv.data.apikey = doc.data().apikey;
        resolve(conv.data.apikey);
      }
      resolve(null);
    }).catch((err) => {
      resolve(null);
    });
  });
}

function setAPIKey(conv, apikey) {
  // User is logged in
  const uid = conv.user.profile.payload.sub;
  conv.data.apikey = apikey;
  conv.user.ref = db.collection('togglgo').doc(uid).set({'apikey': apikey});
}

function startTimerAPI(key, wid) {
  const now = new Date();
  return axios.post("https://www.toggl.com/api/v8/time_entries/start", {
    'time_entry': {
        'description': '',
        'created_with': 'Toggl Go',
        'start': now.toISOString(),
        'wid': wid
      }}, {
      'headers': {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + new Buffer(key + ':' + 'api_token').toString('base64')
    }});
}

function stopTimerAPI(key, timerId) {
  return axios.put(`https://www.toggl.com/api/v8/time_entries/${timerId}/stop`, {}, {
    'headers': {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + new Buffer(key + ':' + 'api_token').toString('base64')
      }
  });
}

function getCurrentTimerAPI(key) {
  return axios.get("https://www.toggl.com/api/v8/time_entries/current", {
    'headers': {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + new Buffer(key + ':' + 'api_token').toString('base64')
    }
  });
}

function getUserDataAPI(key) {
  return axios.get("https://www.toggl.com/api/v8/me", {
    'headers': {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + new Buffer(key + ':' + 'api_token').toString('base64')
    }});
}


function startTimer(conv) {
  const lang = conv.user.locale.substring(0,2);
  return getAPIKey(conv).then((apikey) => {
    if (apikey) {
      return getUserDataAPI(apikey).then(res => {
        const data = res.data;
        return startTimerAPI(apikey, data.data.default_wid).then(res => {
          conv.close(i18n[lang]["START_OK"]);
        }).catch(err => {
          conv.close(i18n[lang]["START_ERROR"]);
        });
      }).catch(err => {
        conv.close(i18n[lang]["START_NO_WID"]);
      });
    } else {
      conv.ask(new SignIn(i18n[lang]["CONTEXT_SIGN_IN"]));
      conv.data.next = "start";
    }
  });
}

function stopTimer(conv) {
  const lang = conv.user.locale.substring(0,2);
  return getAPIKey(conv).then((apikey) => {
    if (apikey) {
      return getCurrentTimerAPI(apikey).then(res => {
        const data = res.data;
        return stopTimerAPI(apikey, data.data.id).then(res => {
          conv.close(i18n[lang]["STOP_OK"]);
        }).catch(err => {
          conv.close(i18n[lang]["STOP_ERROR"]);
        });
      }).catch(err => {
        conv.close(i18n[lang]["STOP_NO_TIMER"]);
      });
    } else {
      conv.ask(new SignIn(i18n[lang]["CONTEXT_SIGN_IN"]));
      conv.data.next = "stop";
    }
  });
}

function apiKey(conv, parameters) {
  const lang = conv.user.locale.substring(0,2);
  setAPIKey(conv, parameters.APIKEY);
  conv.ask(i18n[lang]["API_KEY_GIVEN"]);
  if(conv.data.next === "start") {
    conv.data.next = "";
    return startTimer(conv);
  }
  if(conv.data.next === "stop") {
    conv.data.next = "";
    return stopTimer(conv);
  }
}

function signIn(conv, params, signin) {
  const lang = conv.user.locale.substring(0,2);
  if (signin.status !== "OK") {
  	conv.close(i18n[lang]["SIGN_IN_REFUSED"]);
  } else {
    if (conv.screen) {
      conv.ask(i18n[lang]["ON_SCREEN"]);
    } else if (conv.available.surfaces.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
      conv.ask(new NewSurface({
        context: i18n[lang]["HAS_SCREEN_CONTEXT"],
        notification: i18n[lang]["HAS_SCREEN_NOTIFICATION"],
        capabilities: ["actions.capability.SCREEN_OUTPUT"]
      }));
    } else {
      conv.close(i18n[lang]["NO_SCREEN"]);
    }
  }
}

function signInSwitch(conv, input, newSurface) {
  const lang = conv.user.locale.substring(0,2);
  if (newSurface.status === "OK") {
    conv.ask(i18n[lang]["HAS_SCREEN_SWITCH_SUCCESFUL"]);
  } else {
    conv.close(i18n[lang]["HAS_SCREEN_SWITCH_FAILED"]);
  }
}

const app = dialogflow({
  debug: true,
  clientId: CLIENT_ID
});

app.intent('Start timer', startTimer);
app.intent('Stop timer', stopTimer);
app.intent('API Key', apiKey);
app.intent('Sign in', signIn);
app.intent('Sign in - api', signInSwitch);

exports.dialogflowFirebaseFulfillment = functions.https.onRequest(app);
