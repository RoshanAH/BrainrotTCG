import { Award, Crown, Layers, Settings, UserRound, type LucideIcon } from 'lucide-react';
import '../../styles/AppNav.css';

export type NavTarget = 'collection' | 'achievements' | 'hallOfFame' | 'profile' | 'settings';

const ITEMS: { id: NavTarget; label: string; Icon: LucideIcon }[] = [
  { id: 'collection', label: 'Collection', Icon: Layers },
  { id: 'profile', label: 'Profile', Icon: UserRound },
  { id: 'hallOfFame', label: 'Hall of Fame', Icon: Crown },
  { id: 'achievements', label: 'Achievements', Icon: Award },
  { id: 'settings', label: 'Settings', Icon: Settings },
];

interface AppNavProps {
  onOpen: (target: NavTarget) => void;
  /** Small counter on Achievements, e.g. how many were just unlocked. */
  achievementBadge?: number;
}

/** Bottom tab bar on phones, inline in the header on wide screens (see AppNav.css). */
const AppNav = ({ onOpen, achievementBadge = 0 }: AppNavProps) => (
  <nav className="app-nav" aria-label="Main">
    <ul>
      {ITEMS.map(({ id, label, Icon }) => (
        <li key={id}>
          <button type="button" className="app-nav-item" onClick={() => onOpen(id)}>
            <span className="app-nav-icon" aria-hidden="true">
              <Icon strokeWidth={2.2} />
              {id === 'achievements' && achievementBadge > 0 && <span className="app-nav-badge">{achievementBadge}</span>}
            </span>
            <span className="app-nav-label">{label}</span>
          </button>
        </li>
      ))}
    </ul>
  </nav>
);

export default AppNav;
