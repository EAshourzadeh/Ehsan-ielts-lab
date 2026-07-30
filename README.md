# EHSAN IELTS Mock Test

A browser-based IELTS mock-exam platform for teachers and students. Teachers can build complete Listening, Reading, and Writing exams, manage student accounts, review submissions, and grade results. Students take timed exams through a focused, controlled exam interface.

**Live app:** [ehsan-exams.learninglabs.workers.dev](https://ehsan-exams.learninglabs.workers.dev/)  
**Repository:** [EAshourzadeh/Ehsan-ielts-lab](https://github.com/EAshourzadeh/Ehsan-ielts-lab)

> This is an independent educational project. It is not affiliated with, endorsed by, or operated by IELTS, Cambridge University Press & Assessment, the British Council, or IDP Education.

## Features

### Teacher workspace

- Create and manage multiple mock exams.
- Build up to four Listening parts and three Reading passages.
- Add Writing Task 1 and Task 2 prompts, including a Task 1 image.
- Compose rich question layouts with:
  - fill-in-the-blank questions;
  - multiple-choice and multiple-answer questions;
  - True / False / Not Given questions;
  - labels and instructional text;
  - inline answer blanks;
  - notes cards, tables, option banks, flow charts, and instruction keys.
- Define multiple accepted answers, such as `10 | ten`.
- Collapse large question groups while editing.
- Manage student accounts and account status.
- Review Listening and Reading answers against the answer key.
- Assess both Writing tasks and add teacher feedback.
- Preview, print, and download final result reports.

### Student exam experience

- Separate authenticated student accounts.
- A guided introduction before the exam begins.
- Timed Listening, Reading, and Writing sections.
- One-play Listening audio with progress and remaining-time feedback.
- Automatic answer saving during the exam.
- Collapsible question groups.
- Automatic scoring for objective Listening and Reading questions.
- Controlled answer fields with copy, cut, paste, and context-menu restrictions.
- Direct submission to the teacher workspace for review and grading.

## Technology

- HTML5
- CSS3
- Vanilla JavaScript
- [Firebase Authentication](https://firebase.google.com/docs/auth)
- [Cloud Firestore](https://firebase.google.com/docs/firestore)
- [Quill](https://quilljs.com/) rich-text editor
- Static hosting; the production instance is served through Cloudflare

No build process, package manager, or application server is required.

## Project structure

```text
.
├── assets/
│   ├── audio/                 # Listening audio files
│   └── images/                # Writing Task 1 and other exam images
├── css/
│   ├── style.css
│   ├── exam-content-editors.css
│   └── teacher-grading.css
├── js/
│   ├── firebase-init.js       # Firebase project configuration
│   ├── common.js              # Shared data, auth, scoring, and rendering helpers
│   ├── student-*.js           # Student exam flows
│   └── teacher-*.js           # Teacher dashboard, builder, accounts, and grading
├── firestore.rules
├── index.html
├── student-*.html
└── teacher-*.html
```

## Getting started

### 1. Clone the repository

```bash
git clone https://github.com/EAshourzadeh/Ehsan-ielts-lab.git
cd Ehsan-ielts-lab
```

### 2. Create a Firebase project

In the [Firebase console](https://console.firebase.google.com/):

1. Create or select a Firebase project.
2. Add a Web app to the project.
3. Enable **Authentication → Sign-in method → Email/Password**.
4. Create a **Cloud Firestore** database.
5. Copy the Web app configuration into `js/firebase-init.js`.

Use your own Firebase configuration:

```js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

Firebase Web API keys are identifiers rather than server secrets, but the Firestore rules must still be deployed correctly to protect application data.

### 3. Deploy the Firestore rules

Open **Firestore Database → Rules** in the Firebase console, replace the editor contents with `firestore.rules`, and publish the rules.

The supplied rules provide these main permissions:

- exams are publicly readable so students can select and take an exam;
- only active teachers can create or edit exams;
- students can read their own profile;
- teachers can manage student profiles;
- authenticated students can create their own result submission;
- only teachers can read, update, or delete submitted results.

Review the rules for your own organisation before using the app with real student data.

### 4. Create the first teacher

Teacher registration is intentionally not public.

1. In **Firebase Authentication → Users**, create an Email/Password user.
2. Copy the new user's Firebase UID.
3. In Firestore, create a document at:

```text
teachers/{firebase-user-uid}
```

4. Add at least:

```json
{
  "active": true,
  "email": "teacher@example.com",
  "name": "Teacher Name"
}
```

The teacher can now sign in through `teacher-login.html`.

### 5. Run locally

Serve the folder through a local HTTP server. Do not open the HTML files directly with a `file://` URL.

Using Python:

```bash
python -m http.server 8080
```

Then open:

```text
http://localhost:8080/
```

Other static development servers work as well.

## First-use workflow

1. Sign in as the teacher.
2. Open **Student Accounts** and create a student.
   - Username: exactly seven digits.
   - Password: exactly six characters containing at least one letter and one number.
3. Open **Exam Builder**.
4. Add or edit the Listening, Reading, and Writing content.
5. Put Listening MP3 files in `assets/audio/`.
6. Put Writing Task 1 images in `assets/images/`.
7. Reference assets using relative paths, for example:

```text
assets/audio/listening-part-1.mp3
assets/images/writing-task-1.png
```

8. Submit/save the exam.
9. Give the student their credentials and direct them to the Student Login page.
10. Review the finished attempt in **Grading**.

## Exam data

The application uses these Firestore collections:

| Collection | Purpose |
|---|---|
| `teachers` | Teacher authorisation and active status |
| `students` | Student profiles, usernames, and active status |
| `exams` | Complete exam definitions and answer keys |
| `results` | Student answers, objective scores, grading, and feedback |

Student passwords are managed by Firebase Authentication. They are not stored in Firestore or browser storage.

## Deployment

The app is fully static and can be hosted on Cloudflare, Firebase Hosting, GitHub Pages, Netlify, or any service that can serve HTML, CSS, JavaScript, images, and MP3 files over HTTPS.

For production:

- deploy the contents of the repository root;
- keep all relative asset paths unchanged;
- add the production domain to **Firebase Authentication → Settings → Authorised domains**;
- publish the included Firestore rules;
- test both teacher and student sign-in after deployment;
- confirm that Listening audio files are served with the correct media type.

The current production deployment is available at:

<https://ehsan-exams.learninglabs.workers.dev/>

## Security and privacy notes

- Do not place Firebase Admin SDK credentials, service-account files, private keys, or server secrets in this repository.
- Teacher access depends on both Firebase Authentication and an active document in the `teachers` collection.
- Disable a student from the Student Accounts panel when access should be suspended.
- Use HTTPS in production.
- Establish an appropriate data-retention policy for student submissions and grading information.
- Browser-side clipboard restrictions discourage casual copying but cannot replace supervised exam conditions or locked-down assessment software.

## Browser support

Use a current desktop version of Chrome, Edge, Firefox, or Safari. A desktop or laptop is recommended because the exam interface uses side-by-side reading/question layouts and timed audio.

## Contributing

Issues and pull requests are welcome through the [GitHub repository](https://github.com/EAshourzadeh/Ehsan-ielts-lab).

When contributing:

1. preserve the existing no-build architecture;
2. test both teacher and student flows;
3. avoid committing private student data or credentials;
4. verify Firestore rule implications when changing stored data.

## Author

Designed and developed for educational purposes by **Ehsan Ashour Zadeh.**

