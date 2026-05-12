import { useNavigate } from "react-router-dom";
import Layout from "../../components/Layout";

type CardProps = {
  icon: string;
  color: string;
  title: string;
  subtitle: string;
  onClick: () => void;
};

const cardThemeMap: Record<
  string,
  { color: string; soft: string }
> = {
  success: {
    color: "#198754",
    soft: "#e9f7ef",
  },
  danger: {
    color: "#dc3545",
    soft: "#fdecef",
  },
  primary: {
    color: "#0d6efd",
    soft: "#eaf2ff",
  },
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
              style={{
                width: 58,
                height: 58,
                background: theme.soft,
                color: theme.color,
                fontSize: 24,
                flexShrink: 0,
              }}
            >
              <i className={`fa ${icon}`} />
            </div>

            <div>
              <h6 className="mb-1 fw-bold">{title}</h6>
              {subtitle && (
                <div className="text-muted" style={{ fontSize: 14 }}>
                  {subtitle}
                </div>
              )}
            </div>
          </div>

          <div
            className="d-flex align-items-center justify-content-center rounded-circle dashboard-arrow"
            style={{
              width: 34,
              height: 34,
              background: "#f3f5f7",
              color: "#5f6b73",
              flexShrink: 0,
            }}
          >
            <i className="fa fa-arrow-right" style={{ fontSize: 12 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();

  return (
    <Layout>
      <div className="row g-3">
        <div className="col-12">
          <div className="mb-4">
            <h4 className="fw-bold mb-1" style={{ marginTop: 4 }}>
              Организация и материально-техническая база
            </h4>
            <p className="text-muted mb-0">
              Основные сведения, связанные с образовательной организацией
            </p>
          </div>

          <div className="row">
            <DashCard
              icon="fa-university"
              color="success"
              title="Организации"
              subtitle="Сведения по образовательным организациям"
              onClick={() => navigate("/organizations")}
            />
            <DashCard
              icon="fa-users"
              color="danger"
              title="Кадровый состав"
              subtitle="Общие сведения кадрового состава"
              onClick={() => navigate("/employees")}
            />
            <DashCard
              icon="fa-building"
              color="primary"
              title="Здания"
              subtitle="Материально-техническая база"
              onClick={() => navigate("/buildings")}
            />
          </div>

          <div className="my-4" />

          <div className="mb-4">
            <h5 className="fw-bold mb-1">Кадровый состав</h5>
            <p className="text-muted mb-0">
              Быстрые переходы к категориям сотрудников
            </p>
          </div>

          <div className="row">
            <DashCard
              icon="fa-id-card"
              color="danger"
              title="Все сотрудники"
              subtitle="Полный список сотрудников организации"
              onClick={() => navigate("/employees")}
            />
            <DashCard
              icon="fa-user-tie"
              color="danger"
              title="АУП"
              subtitle="Административно-управленческий персонал"
              onClick={() => navigate("/employees?cat=ADM")}
            />
            <DashCard
              icon="fa-chalkboard-user"
              color="danger"
              title="Педагоги + УВП"
              subtitle="Педагогический персонал"
              onClick={() => navigate("/employees?cat=TEACH")}
            />
            <DashCard
              icon="fa-wrench"
              color="danger"
              title="МОП"
              subtitle="Технический персонал"
              onClick={() => navigate("/employees?cat=TECH")}
            />
          </div>
        </div>
      </div>

      <style>{`
        .dashboard-action-card {
          transition: transform 0.18s ease, box-shadow 0.18s ease;
        }

        .dashboard-action-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 0.9rem 1.8rem rgba(55, 71, 79, 0.10) !important;
        }

        .dashboard-action-card:hover .dashboard-arrow {
          background: #37474f;
          color: #fff !important;
        }

        .dashboard-arrow {
          transition: all 0.18s ease;
        }
      `}</style>
    </Layout>
  );
}
