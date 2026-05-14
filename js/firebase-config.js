// Fill in your Firebase project config here
// Firebase console → Project settings → Your apps → Web app → SDK setup and configuration
const firebaseConfig = {
  apiKey: "AIzaSyCBTMkSItiG8Y2Wb1KsB4r8oKFmLDpto-k",
  authDomain: "polyglot-ad061.firebaseapp.com",
  projectId: "polyglot-ad061",
  storageBucket: "polyglot-ad061.firebasestorage.app",
  messagingSenderId: "675757314839",
  appId: "1:675757314839:web:5e406359a7e1f727861d52"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
