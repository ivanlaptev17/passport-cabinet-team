import { useNavigate } from "react-router-dom";
import Layout from "../../components/Layout";
import ProfilePanel from "../../components/ProfilePanel";

type CardProps = {
  icon: string;
  color: string;
  title: string;
  subtitle: string;
  onClick: () => void;
};

function DashCard({ icon, color, title, subtitle, onClick }: CardProps) {
  return (
    <div className="col-md-4 mb-3">
      <div
        className="card h-100 card-hover"
        style={{ cursor: "pointer", border: "1px solid #ddd" }}
        onClick={onClick}
      >
        <div className="card-body d-flex align-items-center gap-3">
          <i className={`fa ${icon} fa-2x text-${color}`} />
          <div>
            <h6 className="mb-1 fw-semibold">{title}</h6>
            {subtitle && <small className="text-muted">{subtitle}</small>}
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
        {/* Main content */}
        <div className="col-lg-9">
          <h6 className="fw-semibold mb-1" style={{ marginTop: 8 }}>
            Организация и материально-техническая база
          </h6>
          <p className="text-muted small mb-3">
            Основные сведения, связанные с образовательной организацией
          </p>

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

          <hr />

          <h6 className="fw-semibold mb-1">Кадровый состав (фильтры)</h6>
          <p className="text-muted small mb-3">
            Перечень сотрудников по категориям
          </p>

          <div className="row">
            <DashCard
              icon="fa-id-card"
              color="danger"
              title="Все сотрудники"
              subtitle=""
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

        {/* Profile panel */}
        <div className="col-lg-3">
          <ProfilePanel />
        </div>
      </div>

      <style>{`
        .card-hover:hover {
          background-color: #37474f !important;
          color: #fff !important;
        }
        .card-hover:hover .text-muted {
          color: #ccc !important;
        }
        .card-hover:hover i {
          color: #fff !important;
        }
      `}</style>
    </Layout>
  );
}
