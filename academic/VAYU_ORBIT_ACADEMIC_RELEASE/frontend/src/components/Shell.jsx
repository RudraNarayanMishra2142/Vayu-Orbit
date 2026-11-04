import React from 'react';

function Shell({ title, description, children, actions, eyebrow = null }) {
  return (
    <section className="content">
      <div className="page-header">
        <div className="page-header-left">
          {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
          <h1 className="page-title">{title}</h1>
          {description && (
            <p className="page-description">{description}</p>
          )}
        </div>
        {actions && <div className="page-header-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export default Shell;
