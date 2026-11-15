import { schoolIdentity } from "@school/shared";

const panels = [
  { title: "مدیریت مدرسه", english: "ADMINISTRATION", description: "مدیریت امور آموزشی و اجرایی مدرسه", symbol: "م", tone: "admin-red", role: "admin", number: "۰۱" },
  { title: "دبیران", english: "TEACHERS", description: "کلاس‌ها، برنامه هفتگی و ثبت حضور", symbol: "د", tone: "teacher-yellow", role: "teacher", number: "۰۲" },
  { title: "دانش‌آموزان", english: "STUDENTS", description: "درس‌ها، تکالیف و کارنامه تحصیلی", symbol: "آ", tone: "student-blue", role: "student", number: "۰۳" },
  { title: "والدین", english: "PARENTS", description: "پیگیری نمره‌ها و حضور و غیاب فرزند", symbol: "و", tone: "teal", role: "guardian", number: "۰۴" },
];

const features = [
  { icon: "◷", title: "برنامه‌ریزی آموزشی", text: "برنامه کلاس‌ها و رویدادهای مدرسه، منظم و در دسترس." },
  { icon: "▤", title: "پیگیری تحصیلی", text: "نگاهی روشن به حضور، تکالیف و روند پیشرفت درسی." },
  { icon: "⌁", title: "ارتباط همدلانه", text: "راهی یکپارچه برای همراهی مدرسه، دبیر و خانواده." },
];

export default function HomePage() {
  return (
    <main className="site-shell" id="home">
      <header className="topbar">
        <a className="brand" href="#home" aria-label={schoolIdentity.name}>
          <span className="brand-seal" aria-hidden="true"><span>س</span></span>
          <span className="brand-copy"><strong>{schoolIdentity.name}</strong><small>سامانهٔ یکپارچهٔ آموزشی</small></span>
        </a>
        <nav className="main-nav" aria-label="راهنمای صفحه">
          <a className="nav-active" href="#home">صفحهٔ اصلی</a>
          <a href="#portals">پنل‌های کاربری</a>
          <a href="#about">دربارهٔ سامانه</a>
        </nav>
          <a className="header-cta" href="/login">ورود به سامانه <span aria-hidden="true">↖</span></a>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-content">
          <div className="hero-kicker"><span className="kicker-mark">✳</span><span>به سامانهٔ آموزشی مدرسه خوش آمدید</span></div>
          <h1 id="hero-title">یادگیری، با <span>همراهی</span><br />رشد می‌کند.</h1>
          <p className="hero-description">فضایی یکپارچه برای ارتباط مدرسه و خانواده؛<br className="desktop-break" /> تا مسیر آموزش هر دانش‌آموز روشن‌تر و هموارتر باشد.</p>
          <a className="hero-button" href="#portals"><span className="button-icon">↙</span><span>انتخاب پنل و ادامه</span></a>
          <div className="hero-caption"><span className="caption-rule" /> ویژۀ دورهٔ دوم متوسطه <span className="caption-dot">•</span> پایه‌های دهم، یازدهم و دوازدهم</div>
        </div>

        <div className="hero-art" aria-label="فضای مطالعهٔ روشن با کتاب‌هایی به نام دبیرستان سید احمد خمینی" role="img">
          <div className="art-wash" />
          <div className="art-sun" />
          <div className="art-ring ring-a" /><div className="art-ring ring-b" />
          <div className="art-spark spark-a">✳</div><div className="art-spark spark-b">✦</div><div className="art-spark spark-c">✧</div>
          <div className="art-label label-a"><span className="label-glyph">✦</span><span>یادگیری، با همراهی</span></div>
          <div className="book-stack">
            <div className="book book-bottom"><span className="book-edge" /></div>
            <div className="book book-middle"><span className="book-edge" /></div>
            <div className="book book-top"><span className="cover-school">دبیرستان<br />سید احمد خمینی</span><span className="cover-rule" /><span className="cover-caption">دانش، مسئولیت، آینده</span></div>
          </div>
          <div className="art-label label-b"><span className="live-dot" /><span>همراه در مسیر پیشرفت</span></div>
          <div className="art-ground" />
        </div>

        <div className="hero-side-label">آموزش برای فردای روشن</div>
      </section>

      <section className="portals section-wrap" id="portals" aria-labelledby="portals-title">
        <div className="section-heading">
          <div className="section-title-group"><span className="section-overline">دسترسی اختصاصی</span><h2 id="portals-title">به فضای خودتان وارد شوید</h2></div>
          <p>برای مشاهدهٔ اطلاعات متناسب با نقش خود، یکی از پنل‌ها را انتخاب کنید.</p>
        </div>
        <div className="portal-grid">
          {panels.map((panel) => (
            <a className={`portal-card portal-card-link ${panel.tone}`} key={panel.title} href={panel.role === "student" ? "/register" : `/login?role=${panel.role}`} aria-label={panel.role === "student" ? "ثبت‌نام دانش‌آموز" : `ورود به ${panel.title}`}>
              <div className="portal-card-head"><span className="portal-monogram" aria-hidden="true">{panel.symbol}</span><span className="portal-number">{panel.number}</span></div>
              <span className="portal-english">{panel.english}</span>
              <h3>{panel.title}</h3>
              <p>{panel.description}</p>
              <span className="portal-link"><span>{panel.role === "student" ? "ثبت‌نام / ورود" : "ورود به پنل"}</span><span className="portal-arrow" aria-hidden="true">←</span></span>
            </a>
          ))}
        </div>
        <div className="signin-note"><span className="lock-icon" aria-hidden="true">⌑</span><span>هر کاربر با حساب شخصی خود و متناسب با نقش مدرسه وارد می‌شود.</span></div>
      </section>

      <section className="about-section" id="about">
        <div className="section-wrap about-inner">
          <div className="about-heading"><span className="section-overline">مدرسه، یک گام جلوتر</span><h2>همراهی در تمام مسیر<br />آموزش</h2></div>
          <div className="feature-list">
            {features.map((feature, index) => (
              <article className="feature-item" key={feature.title}>
                <span className="feature-icon" aria-hidden="true">{feature.icon}</span>
                <span className="feature-copy"><strong>{feature.title}</strong><small>{feature.text}</small></span>
                <span className="feature-number">{["۰۱", "۰۲", "۰۳"][index]}</span>
              </article>
            ))}
          </div>
          <div className="about-seal" aria-hidden="true"><span>س</span><small>سید احمد خمینی</small></div>
        </div>
      </section>

      <footer className="site-footer section-wrap">
        <a className="footer-brand" href="#home">دبیرستان سید احمد خمینی</a>
        <span className="footer-motto">دانش، مسئولیت، آینده</span>
        <span className="footer-year">سال تحصیلی ۱۴۰۵–۱۴۰۶</span>
      </footer>
    </main>
  );
}
