import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-analytics.js";

const firebaseConfig = {
    apiKey: "AIzaSyA7rNyyggeuJTuC42Z5JrWwdjdf8HBI3TQ",
    authDomain: "precoai-sistema.firebaseapp.com",
    projectId: "precoai-sistema",
    storageBucket: "precoai-sistema.firebasestorage.app",
    messagingSenderId: "1098823322463",
    appId: "1:1098823322463:web:efb8b91a68aa89d7bd44ea",
    measurementId: "G-BHVGNDSMK9"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let analytics = null;
try {
    analytics = getAnalytics(app);
} catch (erro) {
    console.warn("Analytics indisponível:", erro);
}

export { app, db, analytics, collection, getDocs };