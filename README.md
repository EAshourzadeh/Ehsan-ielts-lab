# EHSAN IELTS Mock Test

A browser-based IELTS mock-exam platform for teachers and students. Teachers can create complete Listening, Reading, and Writing tests, manage student accounts, monitor submissions, and grade results. Students take timed exams through a focused interface designed around familiar computer-delivered IELTS layouts.

**Live app:** [ehsan-exams.learninglabs.workers.dev](https://ehsan-exams.learninglabs.workers.dev/)  
**Repository:** [EAshourzadeh/Ehsan-ielts-lab](https://github.com/EAshourzadeh/Ehsan-ielts-lab)

> [!IMPORTANT]
> This is an independent educational project. It is not affiliated with, endorsed by, or operated by IELTS, Cambridge University Press & Assessment, the British Council, or IDP Education.

## Highlights

- Complete teacher and student workflows in one static web application.
- Firebase Authentication and Cloud Firestore-backed accounts, exams, and results.
- Rich IELTS-style authoring for notes, forms, matching, maps/plans, tables, option banks, flow charts, and instruction keys.
- Responsive, full-width Listening workspace with automatic one-play audio.
- Accessible volume slider and mute control with device-level preference persistence.
- Split-screen Reading interface with independent passage and question panes.
- Timed Writing Task 1 and Task 2 workflow with live word counts.
- Automatic objective scoring plus teacher-entered Writing and Speaking bands.
- Printable and downloadable final result reports.
- No framework, build process, package manager, or application server required.

## Features

### Teacher workspace

#### Exam management

- Create, edit, and delete multiple mock exams.
- Build up to four Listening parts and three Reading passages.
- Configure Writing Task 1 and Task 2 prompts, including a Task 1 image.
- Reference repository-hosted MP3 and image assets using relative paths.
- Validate incomplete answer keys before saving an exam.

#### IELTS-style question authoring

- Fill-in-the-blank questions, including multiple blanks in one prompt.
- Single-answer multiple choice.
- Multiple-answer questions such as “Choose TWO”.
- True / False / Not Given questions.
- Labels, instructions, and rich-text question stems.
- Inline answer slots inside formatted content.
- Collapsible and reorderable question groups.
- Multiple accepted answers, for example `10 | ten`.

Question groups can contain structured blocks that mirror common IELTS layouts:

- notes cards;
- forms;
- matching sets with shared answer options;
- map and plan labelling;
- tables;
- option banks;
- flow charts;
- True / False / Not Given instruction keys.

#### Students, submissions, and grading

- Create student accounts with controlled username and password formats.
- Enable or disable student access.
- Reset student passwords.
- Review every Listening and Reading response against the configured answer key.
- Enter Writing and Speaking bands.
- Add written teacher feedback.
- Preview, print, and download a final result report.

### Student exam experience

#### Listening

- Full-width exam workspace dedicated to the questions.
- Compact audio, progress, volume, mute, and skip controls above the questions.
- Automatic audio start for every Listening part.
- One-play behavior with no exposed pause, rewind, seek, replay, download, remote-playback, or speed controls.
- Visible remaining time and playback progress.
- Accessible 0–100% volume slider using native keyboard controls.
- Mute/unmute control that does not pause the recording.
- Previous non-zero volume restoration when unmuting.
- Validated volume preference persistence through `localStorage` for later Listening parts on the same device.
- Two-column question-group layout on wider screens and one column on narrower screens.
- Complex forms, maps, matching sets, tables, option banks, and flow charts automatically span the full question width.
- Part locking and automatic progression after completion or an approved skip.

Browsers can block unprompted media playback. If that happens, the runner keeps the timer active and retries playback after the student’s next ordinary answer or keyboard interaction; it does not expose a replay button.

#### Reading

- Side-by-side passage and question panes on wider screens.
- Responsive single-column fallback on smaller screens.
- Independent scrolling for the passage and questions.
- Previous/next passage navigation.
- Passage-visit tracking before section submission is enabled.
- Automatic answer saving and numbered navigation bubbles.

#### Writing

- Separate timed workflows for Task 1 and Task 2.
- Task 1 image support.
- Live word count.
- Automatic progression from Task 1 to Task 2.
- Final Firestore submission for teacher grading.

#### Exam safeguards

- Section and task timers with automatic submission when time expires.
- Automatic answer persistence between parts and pages.
- Back-navigation and accidental-unload protection during an active exam.
- Copy, cut, paste, and context-menu restrictions in controlled answer fields.
- Listening answer locking after a part finishes.
- Automatic objective scoring for Listening and Reading.

These browser-side controls discourage accidental or casual rule-breaking, but they are not a substitute for supervised exam conditions, managed devices, or dedicated secure assessment software.

## Technology

- HTML5
- CSS3
- Vanilla JavaScript
- [Firebase Authentication](https://firebase.google.com/docs/auth)
- [Cloud Firestore](https://firebase.google.com/docs/firestore)
- [Quill](https://quilljs.com/) for rich-text authoring
- Static hosting; the production deployment is served through Cloudflare

## Project structure

```text
.
├── assets/
│   ├── audio/                    # Listening MP3 files
│   └── images/                   # Writing and map/plan images
├── css/
│   ├── style.css                 # Shared layout, components, and responsive styles
│   ├── exam-content-editors.css  # Builder and structured IELTS content blocks
│   └── teacher-grading.css       # Submission and grading views
├── js/
│   ├── firebase-init.js          # Firebase web-app configuration
│   ├── common.js                 # Shared auth, scoring, rendering, and data helpers
│   ├── student-exam.js           # Listening and Reading exam runner
│   ├── student-writing.js        # Writing runner and final submission
│   ├── student-*.js              # Other student flows
│   └── teacher-*.js              # Dashboard, builder, accounts, and grading
├── firestore.rules               # Firestore access-control rules
├── index.html                    # Public landing page
├── student-*.html                # Student-facing pages
└── teacher-*.html                # Teacher-facing pages
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
4. Create a Cloud Firestore database.
5. Copy the Web app configuration into `js/firebase-init.js`.

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

Firebase Web API keys identify the Firebase project; they are not equivalent to server-side secrets. Application data must still be protected with correctly deployed Firestore rules.

### 3. Deploy the Firestore rules

Open **Firestore Database → Rules**, replace the editor contents with [`firestore.rules`](firestore.rules), and publish the rules.

The supplied rules implement the following access model:

| Collection | Read | Create/update/delete |
|---|---|---|
| `teachers` | A signed-in teacher can read their own document | Not permitted from the browser |
| `exams` | Publicly readable so students can select an exam | Active teachers only |
| `students` | Active teachers or the student who owns the profile | Active teachers only |
| `results` | Active teachers or the student who owns the result | Students create their own result; teachers update or delete |

Review and adapt the rules before using the app with real student data.

### 4. Create the first teacher

Teacher registration is intentionally not public.

1. In **Firebase Authentication → Users**, create an Email/Password user.
2. Copy the user’s Firebase UID.
3. Create the following Firestore document:

```text
teachers/{firebase-user-uid}
```

4. Add at least these fields:

```json
{
  "active": true,
  "email": "teacher@example.com",
  "name": "Teacher Name"
}
```

The teacher can now sign in through `teacher-login.html`.

### 5. Run locally

Serve the repository through HTTP. Do not open the HTML files directly with a `file://` URL.

Using Python:

```bash
python -m http.server 8080
```

Then open [http://localhost:8080/](http://localhost:8080/).

Any static development server that preserves the repository’s relative paths can be used.

## First-use workflow

1. Sign in as the teacher.
2. Open **Student Accounts** and create a student.
   - Username: exactly seven digits.
   - Password: exactly six characters containing at least one letter and one number.
3. Open **Exam Builder**.
4. Create or edit the Listening, Reading, and Writing content.
5. Copy Listening MP3 files into `assets/audio/`.
6. Copy Writing Task 1 and map/plan images into `assets/images/`.
7. Reference those files using relative paths:

   ```text
   assets/audio/listening-part-1.mp3
   assets/images/writing-task-1.png
   ```

8. Complete the answer-key validation and save the exam.
9. Give the student their credentials and direct them to the Student Login page.
10. Review the completed attempt in **Grading**.

## Data model

The application uses four primary Firestore collections:

| Collection | Purpose |
|---|---|
| `teachers` | Teacher authorisation and active status |
| `students` | Student profiles, usernames, and account status |
| `exams` | Exam definitions, media paths, question groups, and answer keys |
| `results` | Student answers, objective scores, grading, bands, and feedback |

Student passwords are managed by Firebase Authentication. They are not stored in Firestore or in browser storage.

The active exam session is kept in `sessionStorage`. The Listening volume preference is the only exam-runner preference intentionally kept in `localStorage` so it can carry into later Listening parts on the device.

## Deployment

The app can be hosted on Cloudflare, Firebase Hosting, GitHub Pages, Netlify, or another static host that serves HTML, CSS, JavaScript, images, and MP3 files over HTTPS.

Production checklist:

1. Deploy the contents of the repository root.
2. Preserve the relative asset paths.
3. Add the production domain under **Firebase Authentication → Settings → Authorised domains**.
4. Publish `firestore.rules`.
5. Test teacher and student sign-in.
6. Confirm that MP3 files are returned with a valid audio media type and support browser range requests.
7. Test the Listening autoplay policy in each supported browser.
8. Verify a complete Listening → Reading → Writing → Results submission.

Current production deployment: <https://ehsan-exams.learninglabs.workers.dev/>

## Browser support

Use a current desktop version of Chrome, Edge, Firefox, or Safari. A desktop or laptop is recommended for the full exam layout.

Responsive behavior includes:

- full-width, two-column Listening question groups on suitable screens;
- one-column Listening groups on narrower screens;
- full-width treatment for complex visual question blocks;
- split-screen Reading on wider screens;
- stacked Reading panes on smaller screens;
- horizontally scrollable internal tables where unavoidable, without introducing page-level horizontal scrolling.

## Recommended regression checks

When changing the exam runner or builder, verify:

- Listening autoplay, one-play enforcement, progress, skip, locking, and automatic progression;
- volume adjustment, mute/unmute, keyboard operation, focus visibility, and persistence between parts;
- Listening question order at desktop and narrow viewport widths;
- full-width treatment for maps, matching sets, forms, tables, option banks, and flow charts;
- Reading passage navigation, visited-passage gating, and the split layout;
- timers, saved answers, navigation bubbles, section submission, and automatic scoring;
- Writing task progression, word counts, and final result creation;
- teacher exam saving, answer-key validation, student management, grading, and report export;
- browser console errors and unexpected horizontal page scrolling.

## Security and privacy

- Never commit Firebase Admin SDK credentials, service-account files, private keys, or server secrets.
- Teacher access requires both Firebase Authentication and an active document in the `teachers` collection.
- Disable student accounts when access should be suspended.
- Use HTTPS in production.
- Establish an appropriate retention policy for student submissions and grading information.
- Treat browser-side clipboard, navigation, and media restrictions as usability safeguards rather than tamper-proof security controls.

## Contributing

Issues and pull requests are welcome through the [GitHub repository](https://github.com/EAshourzadeh/Ehsan-ielts-lab).

When contributing:

1. preserve the no-build architecture unless a broader migration is intentionally proposed;
2. test both teacher and student workflows;
3. keep Reading, Listening, and Writing layout changes section-scoped;
4. verify Firestore rule implications for every data-model change;
5. do not commit private student data, credentials, or production-only secrets.

## Author

Designed and developed for educational purposes by **Ehsan Ashour Zadeh**.
