/* Firebase compat SDK must be loaded before this file. */
const firebaseConfig = {
  apiKey: "AIzaSyBUfNmKsUphRr1Kp8fZJYDo7kBgNskQwcg",
  authDomain: "ehsan-learning-suite.firebaseapp.com",
  projectId: "ehsan-learning-suite",
  storageBucket: "ehsan-learning-suite.firebasestorage.app",
  messagingSenderId: "34749761719",
  appId: "1:34749761719:web:70b285f6bb9017b3836532",
  measurementId: "G-GWR381SKPC"
};

if (typeof firebase !== "undefined" && !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = typeof firebase !== "undefined" && typeof firebase.firestore === "function" ? firebase.firestore() : null;
const auth = typeof firebase !== "undefined" && typeof firebase.auth === "function" ? firebase.auth() : null;
