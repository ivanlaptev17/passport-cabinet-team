/** Плашка внизу каждого экрана: логотип разработчика и для кого сделано. */
export default function Footer() {
  return (
    <footer style={{ background: "linear-gradient(135deg, #37474f, #455a64)" }}>
      <div className="container-fluid px-4 py-3 d-flex align-items-center gap-3 flex-wrap">
        <img src="/logo-white.svg" alt="АНО ИЦТО" style={{ height: 30, objectFit: "contain" }} />
        <span style={{ color: "rgba(255,255,255,0.78)", fontSize: 12, lineHeight: 1.35 }}>
          Разработано компанией АНО ИЦТО
          <br className="d-sm-none" /> для Министерства образования Московской области
        </span>
      </div>
    </footer>
  );
}
