import { Anchor } from '@mantine/core';

/** The official ORCID iD icon (green circle), inlined so it needs no network. */
function OrcidIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      width={15}
      height={15}
      style={{ verticalAlign: 'text-bottom', marginRight: 4 }}
      aria-hidden="true"
    >
      <circle cx="128" cy="128" r="128" fill="#A6CE39" />
      <path
        fill="#fff"
        d="M86.3 186.2H70.9V79.1h15.4v107.1zM108.9 79.1h41.6c39.6 0 57 28.3 57 53.6 0 27.5-21.5 53.6-56.8 53.6h-41.8V79.1zm15.4 93.3h24.5c34.9 0 42.9-26.5 42.9-39.7 0-21.5-13.7-39.7-43.7-39.7h-23.7v79.4zM88.7 56.8c0 5.5-4.5 10.1-10.1 10.1s-10.1-4.6-10.1-10.1c0-5.6 4.5-10.1 10.1-10.1 5.6 0 10.1 4.6 10.1 10.1z"
      />
    </svg>
  );
}

/** A user's ORCID iD rendered as a link to their public ORCID record. */
export function OrcidLink({ orcid, size = 'sm' }: { orcid: string; size?: string }) {
  return (
    <Anchor
      href={`https://orcid.org/${orcid}`}
      target="_blank"
      rel="noopener noreferrer"
      size={size}
      onClick={(e) => e.stopPropagation()}
    >
      <OrcidIcon />
      {orcid}
    </Anchor>
  );
}
