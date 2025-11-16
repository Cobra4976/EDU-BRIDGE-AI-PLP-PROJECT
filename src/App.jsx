import { useState, useEffect } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from './utils/firebase';
import StudentDashboard from './components/StudentDashboard';
import TeacherDashboard from './components/TeacherDashboard';
import './index.css';

// --- Full lists ---
const AFRICAN_COUNTRIES = [
  'Algeria','Angola','Benin','Botswana','Burkina Faso','Burundi','Cameroon','Cape Verde',
  'Central African Republic','Chad','Comoros','Republic of the Congo','Democratic Republic of the Congo',
  'Djibouti','Egypt','Equatorial Guinea','Eritrea','Eswatini','Ethiopia','Gabon','Gambia','Ghana',
  'Guinea','Guinea-Bissau','Ivory Coast','Kenya','Lesotho','Liberia','Libya','Madagascar','Malawi',
  'Mali','Mauritania','Mauritius','Morocco','Mozambique','Namibia','Niger','Nigeria','Rwanda',
  'Sao Tome and Principe','Senegal','Seychelles','Sierra Leone','Somalia','South Africa','South Sudan',
  'Sudan','Tanzania','Togo','Tunisia','Uganda','Zambia','Zimbabwe'
];

const EDUCATIONAL_SYSTEMS = [
  'CBC - Competency Based Curriculum (Kenya)',
  'CBC - Competency Based Curriculum (Tanzania)',
  'CBC - Competency Based Curriculum (Uganda)',
  '8-4-4 System (Kenya - legacy)',
  '6-3-3-4 System (Nigeria)',
  'Universal Basic Education (UBE)',
  'CAPS - Curriculum and Assessment Policy Statements (South Africa)',
  'WAEC / WASSCE (West Africa)',
  'NECO (Nigeria)',
  'Matric / NSC (South Africa)',
  'IB - International Baccalaureate',
  'IGCSE / Cambridge International',
  'A-Levels (British)',
  'American Curriculum (US)',
  'French Baccalauréat (Francophone)',
  'Thanaweya Amma (Egypt)',
  'National Curriculum (country-specific)',
  'Technical/Vocational Pathways',
];

const AFRICAN_LANGUAGES = [
  'English','French','Arabic','Swahili','Hausa','Amharic','Yoruba','Igbo','Portuguese',
  'Akan (Twi)','Oromo','Shona','Zulu','Xhosa','Wolof','Kinyarwanda','Kirundi','Sesotho',
  'Tswana','Tigrinya','Somali','Berber (Tamazight)','Afrikaans','Lingala','Fula','Chichewa'
];

export default function AuthApp() {
  const [isLogin, setIsLogin] = useState(true);
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [selectedRoleForProfile, setSelectedRoleForProfile] = useState('');
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState('');
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState('');
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);

  const [studentData, setStudentData] = useState({
    name: '', country: '', educationalSystem: '', strengths: '', weaknesses: '', languageProficiency: ''
  });
  const [teacherData, setTeacherData] = useState({
    name: '', country: '', educationalSystem: '', subjectArea: '', contactInfo: ''
  });

  // --- Auth listener ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (userDoc.exists()) {
            const profileData = userDoc.data();
            setUserRole(profileData.role || '');

            if (profileData.role === 'teacher') {
              const teacherDoc = await getDoc(doc(db, 'teachers', currentUser.uid));
              if (teacherDoc.exists()) {
                setUserProfile(teacherDoc.data());
                setStep(1);
              } else {
                setUserProfile(null);
                setStep(3);
                setSelectedRoleForProfile('teacher');
              }
            } else if (profileData.role === 'student') {
              const studentDoc = await getDoc(doc(db, 'students', currentUser.uid));
              if (studentDoc.exists()) {
                setUserProfile(studentDoc.data());
                setStep(1);
              } else {
                setUserProfile(null);
                setStep(3);
                setSelectedRoleForProfile('student');
              }
            } else {
              setStep(2);
            }
          } else {
            setStep(2);
          }
        } catch (err) {
          if (err.code === 'unavailable') {
            console.log('📴 Offline: Loading from cache');
          } else {
            console.error('Error fetching user doc:', err);
          }
        }
      } else {
        setUser(null);
        setUserRole('');
        setUserProfile(null);
        setStep(1);
      }
      setInitializing(false);
    });
    return () => unsubscribe();
  }, []);

  // --- Auth actions ---
  const handleAuth = async () => {
    setError('');
    if (!email || !password) {
      setError('Please fill in both email and password.');
      return;
    }
    setLoading(true);
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'users', credential.user.uid), {
          email: credential.user.email,
          role: '',
          createdAt: new Date().toISOString()
        });
        setStep(2);
      }
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') setError('Email already registered.');
      else if (err.code === 'auth/wrong-password') setError('Wrong password.');
      else if (err.code === 'auth/user-not-found') setError('No account found.');
      else setError('Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        await setDoc(userDocRef, {
          email: user.email,
          role: '',
          createdAt: new Date().toISOString()
        });
        setStep(2);
      }
    } catch (err) {
      console.error('Google sign-in error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Sign-in cancelled.');
      } else if (err.code === 'auth/popup-blocked') {
        setError('Popup blocked. Please allow popups for this site.');
      } else {
        setError('Google sign-in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Enter your email to reset password.');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setResetEmailSent(true);
    } catch {
      setError('Failed to send reset email.');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleSelection = async (chosenRole) => {
    setError('');
    setLoading(true);
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('User not authenticated.');

      await setDoc(doc(db, 'users', uid), { role: chosenRole }, { merge: true });
      setSelectedRoleForProfile(chosenRole);
      setStep(3);
      setRole(chosenRole);
    } catch (err) {
      console.error('Failed to save role:', err);
      setError('Failed to save role. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleProfileSubmit = async () => {
    setError('');
    setLoading(true);
    try {
      const uid = user?.uid;
      if (!uid) throw new Error('User not authenticated.');

      let profilePayload = {};
      let collection = '';

      if (selectedRoleForProfile === 'student') {
        const values = Object.values(studentData);
        if (values.some(v => !String(v || '').trim())) {
          setError('Please fill all student fields.');
          setLoading(false);
          return;
        }
        profilePayload = { email, role: 'student', ...studentData, createdAt: new Date().toISOString() };
        collection = 'students';
      } else {
        const values = Object.values(teacherData);
        if (values.some(v => !String(v || '').trim())) {
          setError('Please fill all teacher fields.');
          setLoading(false);
          return;
        }
        profilePayload = { email, role: 'teacher', ...teacherData, createdAt: new Date().toISOString() };
        collection = 'teachers';
      }

      await setDoc(doc(db, collection, uid), profilePayload, { merge: true });
      await setDoc(doc(db, 'users', uid), { email, role: selectedRoleForProfile }, { merge: true });

      setUserRole(profilePayload.role);
      setUserProfile(profilePayload);
      setStep(1);
    } catch (err) {
      console.error(err);
      setError('Failed to save profile.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
    setUserRole('');
    setUserProfile(null);
    setEmail('');
    setPassword('');
    setStep(1);
  };

  // --- Theming ---
  const bg = "bg-[#f9fdf9]";
  const card = "bg-white border border-green-100 shadow-lg";
  const text = "text-[#1b1b1b]";
  const accent = "bg-[#2e7d32] hover:bg-[#43a047] text-white";
  const heading = "text-[#2e7d32]";
  const inputBase = "w-full mb-3 px-3 py-2.5 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#43a047] focus:border-transparent bg-white text-[#1b1b1b] text-base";
  // const inputBase = "w-full mb-4 px-4 py-3 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#43a047] focus:border-transparent bg-white text-[#1b1b1b] text-base";

  // --- Initial Welcome screen ---
  if (showWelcome) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${bg} px-6`}>
        {/* <div className={`max-w-xl ${card} p-8 rounded-xl text-center`}> */}
        <div className={`max-w-xl ${card} p-10 rounded-2xl shadow-lg text-center`}>
          <h1 className="text-3xl font-bold mb-4 text-[#2e7d32]">Welcome to EduBridge Africa</h1>
          <p className="text-gray-700 mb-6">
            EduBridge Africa is a web application designed to connect teachers and students across Africa, helping learners access tailored educational resources and support. Please login or sign up with your email to continue.
          </p>
          <button
            className={`px-6 py-3 rounded ${accent}`}
            onClick={() => setShowWelcome(false)}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  // --- Loading state ---
  if (initializing) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${bg}`}>
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#2e7d32] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className={`${text}`}>Loading...</div>
        </div>
      </div>
    );
  }

  // --- Dashboard routing ---
  if (user && userProfile && userRole === 'student')
    return <StudentDashboard user={user} studentProfile={userProfile} onLogout={handleLogout} />;
  if (user && userProfile && userRole === 'teacher')
    return <TeacherDashboard user={user} teacherProfile={userProfile} onLogout={handleLogout} />;

  // --- Step 1: Auth screen ---
  if (!user && step === 1) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${bg} px-4`}>
       {/* <div className={`flex justify-center items-center min-h-screen ${bg} px-4`}> */}
        {/* <div className={`w-full max-w-md ${card} p-8 rounded-2xl`}> */}
          <div className={`w-full max-w-lg ${card} p-4 rounded-2xl shadow-lg`}>
          <h2 className={`text-3xl font-bold text-center mb-6 ${heading}`}>
            {isLogin ? 'Sign In' : 'Sign Up'}
          </h2>
          
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}
          
          {resetEmailSent && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4 text-sm">
              Password reset email sent!
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className={inputBase}
                placeholder="Enter email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className={inputBase}
                placeholder="Enter password"
              />
            </div>

            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  I am a
                </label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  className={inputBase}
                >
                  <option value="student">Student</option>
                  <option value="teacher">Teacher</option>
                </select>
              </div>
            )}
          </div>

          {isLogin && (
            <div className="mt-4 mb-6">
              <button
                onClick={handleForgotPassword}
                className="text-white hover:text-[#43a047] font-medium text-sm"
            
              >
                Forgot password?
              </button>
            </div>
          )}

          <button
            onClick={handleAuth}
            disabled={loading}
            className={`w-full py-2 mt-3 rounded-md font-medium ${accent} transition`}
            // className={`w-full py-3 rounded-lg font-medium ${accent} transition-colors mt-6`}
          >
            {loading ? 'Processing...' : isLogin ? 'Sign In' : 'Continue'}
          </button>

          <div className="flex items-center my-6">
            <div className="flex-1 border-t border-gray-300"></div>
            <span className="px-4 text-gray-500 text-sm">or</span>
            <div className="flex-1 border-t border-gray-300"></div>
          </div>

          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full py-3 rounded-lg border-2 border-gray-300 hover:bg-gray-50 text-[#1b1b1b] font-medium transition-colors flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {loading ? 'Processing...' : 'Continue with Google'}
          </button>

          <p className="mt-6 text-sm text-white flex justify-center items-center gap-2">
            {isLogin ? "Don't have an account?" : "Already have an account?"}
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
                setResetEmailSent(false);
              }}
             className="text-white hover:text-[#43a047] ml-2 font-semibold" 
            >
              {isLogin ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </div>
      </div>
    );
  }

  // --- Step 2: Role selection ---
  if (user && step === 2) {
    return (
      <div
       className={`min-h-screen flex items-center justify-center ${bg} px-4`}>
      {/* <div className={`flex justify-center items-center min-h-screen ${bg} px-4`}> */}
        {/* <div className={`w-full max-w-md ${card} p-8 rounded-2xl`}> */}
        <div className={`w-full max-w-md ${card} p-6 rounded-2xl shadow-lg`}>
          <h2 className={`text-2xl font-bold text-center mb-6 ${heading}`}>Select Your Role</h2>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}
          <div className="flex gap-4 mb-6">
            <button
              onClick={() => handleRoleSelection('student')}
              className={`flex-1 px-6 py-3 rounded-lg font-medium ${accent} transition-colors`}
            >
              Student
            </button>
            <button
              onClick={() => handleRoleSelection('teacher')}
              className={`flex-1 px-6 py-3 rounded-lg font-medium ${accent} transition-colors`}
            >
              Teacher
            </button>
          </div>
          <button
            onClick={handleLogout}
          className="w-full py-3 rounded-lg border-2 border-gray-300 hover:bg-gray-50 text-white font-medium transition-colors"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // --- Step 3: Complete profile ---
  if (step === 3 && selectedRoleForProfile) {
    const isStudent = selectedRoleForProfile === 'student';
    return (
      <div className={`min-h-screen flex items-center justify-center ${bg} px-4`}>
      {/* <div className={`flex justify-center items-center min-h-screen ${bg} px-4 py-8`}> */}
        {/* <div className={`w-full max-w-md ${card} p-8 rounded-2xl`}> */}
        <div className={`w-full max-w-md ${card} p-6 rounded-2xl shadow-lg`}>
          <h2 className={`text-2xl font-bold text-center mb-6 ${heading}`}>
            {isStudent ? 'Student Profile' : 'Teacher Profile'}
          </h2>
          
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {isStudent ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                  <input
                    type="text"
                    value={studentData.name}
                    onChange={e => setStudentData({ ...studentData, name: e.target.value })}
                    className={inputBase}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Country</label>
                  <select
                    value={studentData.country}
                    onChange={e => setStudentData({ ...studentData, country: e.target.value })}
                    className={inputBase}
                  >
                    <option value="">Select country</option>
                    {AFRICAN_COUNTRIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Educational System</label>
                  <select
                    value={studentData.educationalSystem}
                    onChange={e => setStudentData({ ...studentData, educationalSystem: e.target.value })}
                    className={inputBase}
                  >
                    <option value="">Select system</option>
                    {EDUCATIONAL_SYSTEMS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Language</label>
                  <select
                    value={studentData.languageProficiency}
                    onChange={e => setStudentData({ ...studentData, languageProficiency: e.target.value })}
                    className={inputBase}
                  >
                    <option value="">Select language</option>
                    {AFRICAN_LANGUAGES.map(l => <option key={l}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Strengths</label>
                  <textarea
                    value={studentData.strengths}
                    onChange={e => setStudentData({ ...studentData, strengths: e.target.value })}
                    className={inputBase}
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Areas for Improvement</label>
                  <textarea
                    value={studentData.weaknesses}
                    onChange={e => setStudentData({ ...studentData, weaknesses: e.target.value })}
                    className={inputBase}
                    rows={3}
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                  <input
                    type="text"
                    value={teacherData.name}
                    onChange={e => setTeacherData({ ...teacherData, name: e.target.value })}
                    className={inputBase}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Country</label>
                  <select
                    value={teacherData.country}
                    onChange={e => setTeacherData({ ...teacherData, country: e.target.value })}
                    className={inputBase}
                  >
                    <option value="">Select country</option>
                    {AFRICAN_COUNTRIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Educational System</label>
                  <select
                    value={teacherData.educationalSystem}
                    onChange={e => setTeacherData({ ...teacherData, educationalSystem: e.target.value })}
                    className={inputBase}
                  >
                    <option value="">Select system</option>
                    {EDUCATIONAL_SYSTEMS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Subject Area</label>
                  <input
                    type="text"
                    value={teacherData.subjectArea}
                    onChange={e => setTeacherData({ ...teacherData, subjectArea: e.target.value })}
                    className={inputBase}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Contact Info</label>
                  <input
                    type="text"
                    value={teacherData.contactInfo}
                    onChange={e => setTeacherData({ ...teacherData, contactInfo: e.target.value })}
                    className={inputBase}
                  />
                </div>
              </>
            )}
          </div>

          <button
            onClick={handleProfileSubmit}
            disabled={loading}
            className={`w-full py-3 mt-6 rounded-lg font-medium ${accent} transition-colors`}
          >
            {loading ? 'Saving...' : 'Save Profile'}
          </button>

          <button
            onClick={() => setStep(2)}
            className="w-full py-3 rounded-lg border-2 border-gray-300 hover:bg-gray-50 text-white font-medium transition-colors"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // --- Fallback ---
  return (
    <div className={`min-h-screen flex items-center justify-center ${bg}`}>
      <p className={`${text}`}>Loading</p>
    </div>
  );
}

































