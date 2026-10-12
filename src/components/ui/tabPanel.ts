/** Props for the panel of the selected tab (see Tabs.tsx), so it and its tab point at each other. */
export const tabPanelProps = (idBase: string, value: string) => ({
  id: `${idBase}-${value}-panel`,
  role: 'tabpanel' as const,
  'aria-labelledby': `${idBase}-${value}`,
  tabIndex: 0,
});
