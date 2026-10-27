// Дані з Supabase → Project Settings → API (Project URL і anon / publishable key).
const SUPABASE_URL = 'https://clalsfngaghzdcaoxgzg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_78DgS_hjwxN4JOpWMxlA8Q_WLx0XLhi';

// Час на проходження, у секундах.
const QUIZ_DURATION_SEC = 5 * 60;

// Обліковий запис викладача в Supabase Auth (Authentication → Users). Має збігатися з email у supabase/admin.sql.
const ADMIN_EMAIL = 'teacher@example.com';
