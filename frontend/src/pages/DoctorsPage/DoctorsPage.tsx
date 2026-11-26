import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import type { UserCard } from '../../api/types';
import { listUsers } from '../../api/users';
import { useAuth } from '../../auth/AuthContext';
import { canManageUsers } from '../../auth/roles';
import { Message } from '../../components/Message/Message';
import { useAsync } from '../../hooks/useAsync';
import { fullName } from '../../utils/person';
import './doctors.css';
import './doctor-list.css';
import './doctor-card.css';

function matches(card: UserCard, query: string): boolean {
  if (!query) return true;
  const haystacks = [
    card.surname,
    card.name,
    fullName(card),
    `${card.name} ${card.surname}`,
    card.specialization ?? '',
  ];
  return haystacks.some((h) => h.toLocaleLowerCase().includes(query));
}

export function DoctorsPage() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const [search, setSearch] = useState('');

  const userId = user?.id;
  const userRole = user?.role;
  const canEdit = canManageUsers(userRole);

  // Состав списка зависит от роли, поэтому читаем после ответа /api/auth/me и перечитываем при смене пользователя.
  const cards = useAsync(loading ? null : listUsers, [loading, userId, userRole]);

  const query = search.trim().toLocaleLowerCase();
  const visible = cards.data?.filter((card) => matches(card, query)) ?? [];
  const failed = cards.error !== undefined;

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
      {failed && <Message variant="error">{t('common.genericError')}</Message>}
      {!failed && !cards.data && <Message variant="muted">{t('common.loading')}</Message>}
      {cards.data && visible.length === 0 && <Message variant="muted">{t('doctors.notFound')}</Message>}
      {visible.length > 0 && (
        <ul className="doctor-list">
          {visible.map((card) => (
            <li className="doctor-list__item" key={card.id}>
              <article className={card.isActive ? 'doctor-card' : 'doctor-card doctor-card--inactive'}>
                <h2 className="doctor-card__title">{fullName(card)}</h2>
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
