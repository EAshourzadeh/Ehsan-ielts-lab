/* =========================================================
   EHSAN IELTS Mock Test — js/firebase-init.js
   Loaded on every page BEFORE common.js.
   ========================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyBUfNmKsUphRr1Kp8fZJYDo7kBgNskQwcg",
  authDomain: "ehsan-learning-suite.firebaseapp.com",
  projectId: "ehsan-learning-suite",
  storageBucket: "ehsan-learning-suite.firebasestorage.app",
  messagingSenderId: "34749761719",
  appId: "1:34749761719:web:70b285f6bb9017b3836532",
  measurementId: "G-GWR381SKPC"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
