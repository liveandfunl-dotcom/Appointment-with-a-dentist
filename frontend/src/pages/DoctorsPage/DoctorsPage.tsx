import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import './doctors.css';
import './doctor-list.css';
import './doctor-card.css';

interface UserCard {
  id: number;
  surname: string;
  name: string;
  role: 'doctor' | 'admin';
  specialization: string | null;
  phone: string;
  email: string;
  room: number | null;
  workDays: number[];
  workStart: string | null;
  workEnd: string | null;
  isActive: boolean;
}

function matches(card: UserCard, query: string): boolean {
  if (!query) return true;
  const haystacks = [
    card.surname,
    card.name,
    `${card.surname} ${card.name}`,
    `${card.name} ${card.surname}`,
    card.specialization ?? '',
  ];
  return haystacks.some((h) => h.toLocaleLowerCase().includes(query));
}

export function DoctorsPage() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const [cards, setCards] = useState<UserCard[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState('');

  const userId = user?.id;
  const userRole = user?.role;
  const canEdit = userRole === 'admin' || userRole === 'root';

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    api
      .get<UserCard[]>('/api/users')
      .then((data) => {
        if (cancelled) return;
        setFailed(false);
        setCards(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loading, userId, userRole]);

  const query = search.trim().toLocaleLowerCase();
  const visible = cards?.filter((card) => matches(card, query)) ?? [];

  return (
    <div className="doctors">
      <h1>{t('doctors.title')}</h1>
      <div className="form-field doctors__search">
        <label className="form-field__label" htmlFor="doctors-search">
          {t('doctors.search')}
        </label>
        <input
          id="doctors-search"
          type="search"
          value={search}
          placeholder={t('doctors.searchPlaceholder')}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {failed && (
        <p className="doctors__error" role="alert">
          {t('common.genericError')}
        </p>
      )}
      {!failed && cards === null && <p className="doctors__empty">{t('common.loading')}</p>}
      {cards !== null && visible.length === 0 && <p className="doctors__empty">{t('doctors.notFound')}</p>}
      {visible.length > 0 && (
        <ul className="doctor-list">
          {visible.map((card) => (
            <li className="doctor-list__item" key={card.id}>
              <article className={card.isActive ? 'doctor-card' : 'doctor-card doctor-card--inactive'}>
                <h2 className="doctor-card__title">{`${card.surname} ${card.name}`}</h2>
                {card.role === 'admin' && <p className="doctor-card__badge">{t('doctors.roleAdmin')}</p>}
                {!card.isActive && (
                  <p className="doctor-card__badge doctor-card__badge--inactive">{t('doctors.inactive')}</p>
                )}
                <dl className="doctor-card__details">
                  {card.role === 'doctor' && <Row label={t('doctors.specialization')} value={card.specialization} />}
                  <Row label={t('doctors.phone')} value={card.phone} />
                  <Row label={t('doctors.email')} value={card.email} />
                  {card.role === 'doctor' && (
                    <>
                      <Row label={t('doctors.room')} value={card.room} />
                      <Row
                        label={t('doctors.workDays')}
                        value={[...card.workDays]
                          .sort((a, b) => a - b)
                          .map((d) => t(`weekdays.${d}`))
                          .join(', ')}
                      />
                      <Row label={t('doctors.workHours')} value={`${card.workStart}–${card.workEnd}`} />
                    </>
                  )}
                </dl>
                {canEdit && (
                  <Link className="doctor-card__edit" to={`/doctors/${card.id}/edit`} aria-label={t('doctors.edit')}>
                    ✎
                  </Link>
                )}
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number | null }) {
  return (
    <>
      <dt className="doctor-card__label">{label}</dt>
      <dd className="doctor-card__value">{value}</dd>
    </>
  );
}
