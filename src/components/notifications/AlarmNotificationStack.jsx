import { useState } from 'react';
import { useNavigate } from '@/lib/router-shim';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bell, AlertOctagon } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import useAlarmNotificationsStore from '../../store/alarmNotificationsStore';
import './alarmNotifications.css';

/**
 * Mac-style in-app alarm notification stack.
 *
 * Layout:
 *   • Always rendered in DashboardLayout, but renders nothing when the
 *     store is empty.
 *   • Fixed-position, top-right, BELOW the sticky SecureOpsHeader so it
 *     never overlaps the site dropdown / brand row.
 *   • 1 alarm  → single card.
 *   • 2+ alarms → collapsed stack (Mac-style: top card visible, two more
 *     peeking behind/below with reduced scale + opacity). Click the stack
 *     to expand into a vertical list of individual cards. "Close all"
 *     button in the always-visible header bar clears the entire list.
 *
 * Each card carries an X close button — dismissed alarms drop out of the
 * stack but stay in the underlying alarm history (this is a UI overlay,
 * not a mutation against OpenRemote).
 */

const SEVERITY_TONE = {
  CRITICAL: 'danger',
  HIGH:     'danger',
  MEDIUM:   'warning',
  LOW:      'mute',
};

function toneOf(alarm) {
  return SEVERITY_TONE[(alarm?.severity || 'MEDIUM').toUpperCase()] || 'mute';
}

export default function AlarmNotificationStack() {
  const items = useAlarmNotificationsStore((s) => s.items);
  const dismiss = useAlarmNotificationsStore((s) => s.dismiss);
  const dismissAll = useAlarmNotificationsStore((s) => s.dismissAll);
  const [expandedPref, setExpanded] = useState(false);

  if (items.length === 0) return null;

  const single = items.length === 1;
  // Derive expanded during render — `expandedPref` is the user's intent, but
  // when the list has ≤1 item there's nothing to expand into. This avoids
  // the setState-in-effect anti-pattern flagged by the `react-hooks/
  // set-state-in-effect` lint rule.
  const expanded = !single && expandedPref;
  const showList = single || expanded;

  return (
    <div className="alarm-stack" role="region" aria-label="Alarm notifications">
      <div className="alarm-stack-head">
        <span className="alarm-stack-title">
          <Bell className="w-3.5 h-3.5" strokeWidth={2} />
          {items.length} alarm{items.length === 1 ? '' : 's'}
        </span>
        <div className="alarm-stack-actions">
          {!single && (
            <button
              type="button"
              className="alarm-stack-btn"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Collapse' : 'Expand'}
            </button>
          )}
          <button
            type="button"
            className="alarm-stack-btn alarm-stack-btn-danger"
            onClick={dismissAll}
          >
            Close all
          </button>
        </div>
      </div>

      {showList ? (
        <div className="alarm-stack-list">
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <AlarmCard
                key={item.id}
                item={item}
                onDismiss={() => dismiss(item.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <CollapsedStack
          items={items}
          onExpand={() => setExpanded(true)}
          onDismissTop={() => dismiss(items[0].id)}
        />
      )}
    </div>
  );
}

function CollapsedStack({ items, onExpand, onDismissTop }) {
  // Visualise up to 3 layers — top card fully visible, two behind shifted
  // down + scaled-down + faded to suggest depth.
  const visible = items.slice(0, 3);
  return (
    <div
      className="alarm-stack-collapsed"
      role="button"
      tabIndex={0}
      onClick={onExpand}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onExpand();
        }
      }}
      aria-label={`Expand ${items.length} alarms`}
    >
      {visible
        .slice()
        .reverse()
        // Render back-to-front so the top card paints last (DOM order ==
        // paint order; explicit z-index avoided to keep the stack simple).
        .map((item, revIdx) => {
          const idx = visible.length - 1 - revIdx;
          return (
            <div
              key={item.id}
              className="alarm-stack-peek"
              data-index={idx}
              style={{
                top: `${idx * 8}px`,
                transform: `scale(${1 - idx * 0.04})`,
                opacity: 1 - idx * 0.22,
              }}
            >
              <AlarmCardBody
                item={item}
                showDismiss={idx === 0}
                interactive={false}
                onDismiss={(e) => { e.stopPropagation(); onDismissTop(); }}
              />
            </div>
          );
        })}
    </div>
  );
}

function AlarmCard({ item, onDismiss }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 12, transition: { duration: 0.12 } }}
      transition={{ duration: 0.14 }}
      className="alarm-stack-item"
    >
      <AlarmCardBody item={item} showDismiss onDismiss={onDismiss} />
    </motion.div>
  );
}

function AlarmCardBody({ item, showDismiss, onDismiss, interactive = true }) {
  const navigate = useNavigate();
  const { alarm, ts } = item;
  const tone = toneOf(alarm);
  const title = alarm.title || 'New alarm';
  const source = alarm.sourceName || '';
  const when = `${formatDistanceToNowStrict(new Date(ts))} ago`;
  const content = (
    <>
      <span className="alarm-card-title">{title}</span>
      {source && <span className="alarm-card-source">{source}</span>}
      <span className="alarm-card-when">{when}</span>
    </>
  );
  return (
    <div className="alarm-card-body" data-tone={tone}>
      <div className="alarm-card-rail" />
      <AlertOctagon className="alarm-card-icon" strokeWidth={2} />
      {interactive ? (
        <button
          type="button"
          className="alarm-card-text"
          onClick={() => navigate('/alarms')}
          title="Open alerts page"
        >
          {content}
        </button>
      ) : (
        <div className="alarm-card-text alarm-card-text--static">
          {content}
        </div>
      )}
      {showDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="alarm-card-close"
          aria-label="Dismiss alarm"
          title="Dismiss"
        >
          <X className="w-3.5 h-3.5" strokeWidth={2.25} />
        </button>
      )}
    </div>
  );
}
