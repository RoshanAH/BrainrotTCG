import '../../styles/Sets.css';

/** A finished set: "Complete" (every card) or "Master" (every card as a holo). On set chips and profiles. */
const SetBadge = ({ done }: { done: 'complete' | 'master' }) => (
  <span className={`set-badge set-badge--${done}`} title={done === 'master' ? 'Every card as a holo' : 'Every card'}>
    {done === 'master' ? 'Master' : 'Complete'}
  </span>
);

export default SetBadge;
