import { useNavigate } from "react-router-dom";
import Layout from "../../components/Layout";

type CardProps = {
  icon: string;
  color: string;
  title: string;
  subtitle: string;
  onClick: () => void;
};

const cardThemeMap: Record<string, { color: string; soft: string }> = {
  success: { color: "#198754", soft: "#e9f7ef" },
  danger:  { color: "#dc3545", soft: "#fdecef" },
  primary: { color: "#0d6efd", soft: "#eaf2ff" },
  warning: { color: "#fd7e14", soft: "#fff3e0" },
  purple:  { color: "#6f42c1", soft: "#f0ebff" },
  teal:    { color: "#0d9488", soft: "#e6f7f6" },
};

function DashCard({ icon, color, title, subtitle, onClick }: CardProps) {
  const theme = cardThemeMap[color] ?? cardThemeMap.primary;

  return (
    <div className="col-xl-4 col-md-6 mb-3">
      <div
        className="card h-100 border-0 shadow-sm rounded-4 dashboard-action-card"
        style={{ cursor: "pointer", background: "#fff" }}
        onClick={onClick}
      >
        <div className="card-body d-flex align-items-center justify-content-between gap-3 p-4">
          <div className="d-flex align-items-center gap-3">
            <div
              className="d-flex align-items-center justify-content-center rounded-4"
              style={{ width: 58, height: 58, background: theme.soft, color: theme.color, fontSize: 24, flexShrink: 0 }}
            >
              <i className={`fa ${icon}`} />
            </div>
            <div>
              <h6 className="mb-1 fw-bold">{title}</h6>
              {subtitle && <div className="text-muted" style={{ fontSize: 14 }}>{subtitle}</div>}
            </div>
          </div>
          <div
            className="d-flex align-items-center justify-content-center rounded-circle dashboard-arrow"
            style={{ width: 34, height: 34, background: "#f3f5f7", color: "#5f6b73", flexShrink: 0 }}
          >
            <i className="fa fa-arrow-right" style={{ fontSize: 12 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="col-12 mt-4 mb-2">
      <h5 className="fw-bold mb-1">{title}</h5>
      <p className="text-muted mb-0" style={{ fontSize: 14 }}>{subtitle}</p>
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();

  return (
    <Layout>
      <div className="row g-0">

        {/* ── Организация и МТБ ── */}
        <SectionHeader
          title="Организация и материально-техническая база"
          subtitle="Основные сведения об образовательной организации"
        />
        <div className="col-12"><div className="row">
          <DashCard icon="fa-university" color="success" title="Организации"
            subtitle="Сведения по образовательным организациям" onClick={() => navigate("/organizations")} />
          <DashCard icon="fa-building" color="primary" title="Здания"
            subtitle="Материально-техническая база" onClick={() => navigate("/buildings")} />
        </div></div>

        {/* ── Кадровый состав ── */}
        <SectionHeader
          title="Кадровый состав"
          subtitle="Общие сведения и списки сотрудников по категориям"
        />
        <div className="col-12"><div className="row">
          <DashCard icon="fa-table" color="danger" title="Общие сведения"
            subtitle="Штатное расписание и укомплектованность" onClick={() => navigate("/staff-info")} />
          <DashCard icon="fa-id-card" color="danger" title="Все сотрудники"
            subtitle="Полный список сотрудников" onClick={() => navigate("/employees")} />
          <DashCard icon="fa-user-tie" color="danger" title="АУП"
            subtitle="Административно-управленческий персонал" onClick={() => navigate("/employees?cat=ADM")} />
          <DashCard icon="fa-chalkboard-user" color="danger" title="Педагоги + УВП"
            subtitle="Педагогический персонал" onClick={() => navigate("/employees?cat=TEACH")} />
          <DashCard icon="fa-wrench" color="danger" title="МОП"
            subtitle="Младший обслуживающий персонал" onClick={() => navigate("/employees?cat=TECH")} />
        </div></div>

        {/* ── Контингент ── */}
        <SectionHeader
          title="Контингент обучающихся"
          subtitle="Численность, классы и параллели"
        />
        <div className="col-12"><div className="row">
          <DashCard icon="fa-users" color="teal" title="Контингент"
            subtitle="Общая численность обучающихся" onClick={() => navigate("/contingent")} />
          <DashCard icon="fa-graduation-cap" color="teal" title="Классы и параллели"
            subtitle="Список классов и численность по параллелям" onClick={() => navigate("/contingent")} />
        </div></div>

        {/* ── Образовательная деятельность ── */}
        <SectionHeader
          title="Образовательная деятельность"
          subtitle="Урочная, внеурочная и дополнительное образование"
        />
        <div className="col-12"><div className="row">
          <DashCard icon="fa-book-open" color="purple" title="Образовательная деятельность"
            subtitle="Урочная, внеурочная, доп. образование" onClick={() => navigate("/education")} />
        </div></div>

        {/* ── Финансовая деятельность ── */}
        <SectionHeader
          title="Финансовая деятельность"
          subtitle="Финансовые записи, субсидии и договоры"
        />
        <div className="col-12"><div className="row">
          <DashCard icon="fa-ruble-sign" color="warning" title="Финансовые записи"
            subtitle="Расходы по категориям" onClick={() => navigate("/finance")} />
          <DashCard icon="fa-handshake" color="warning" title="Субсидии"
            subtitle="Субсидии и целевое финансирование" onClick={() => navigate("/finance")} />
          <DashCard icon="fa-file-contract" color="warning" title="Договоры"
            subtitle="Заключённые договоры и контракты" onClick={() => navigate("/finance")} />
        </div></div>

      </div>

      <style>{`
        .dashboard-action-card { transition: transform 0.18s ease, box-shadow 0.18s ease; }
        .dashboard-action-card:hover { transform: translateY(-4px); box-shadow: 0 0.9rem 1.8rem rgba(55,71,79,0.10) !important; }
        .dashboard-action-card:hover .dashboard-arrow { background: #37474f; color: #fff !important; }
        .dashboard-arrow { transition: all 0.18s ease; }
      `}</style>
    </Layout>
  );
}
