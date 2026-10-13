import { History, Globe, Layers, Settings, UserRound, type LucideIcon } from 'lucide-react';
import '../../styles/AppNav.css';

export type NavTarget = 'collection' | 'pulls' | 'hallOfFame' | 'profile' | 'settings';

const ITEMS: { id: NavTarget; label: string; Icon: LucideIcon }[] = [
  { id: 'collection', label: 'Collection', Icon: Layers },
  { id: 'pulls', label: 'My pulls', Icon: History },
  { id: 'hallOfFame', label: 'Global', Icon: Globe },
  { id: 'profile', label: 'Profile', Icon: UserRound },
  { id: 'settings', label: 'Settings', Icon: Settings },
];

interface AppNavProps {
  onOpen: (target: NavTarget) => void;
}

/** Bottom tab bar on phones, inline in the header on wide screens (see AppNav.css). */
const AppNav = ({ onOpen }: AppNavProps) => (
  <nav className="app-nav" aria-label="Main">
    <ul>
      {ITEMS.map(({ id, label, Icon }) => (
        <li key={id}>
          <button type="button" className="app-nav-item" onClick={() => onOpen(id)}>
            <span className="app-nav-icon" aria-hidden="true">
              <Icon strokeWidth={2.2} />
            </span>
            <span className="app-nav-label">{label}</span>
          </button>
        </li>
      ))}
    </ul>
  </nav>
);

export default AppNav;
