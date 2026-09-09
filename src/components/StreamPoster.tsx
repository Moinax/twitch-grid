export function StreamPoster() {
  return (
    <>
      <img className="stream-poster" alt="" decoding="async" loading="lazy" />
      <div className="preview-status" hidden>
        <i className="preview-avatar">
          <img alt="" />
        </i>
        <span></span>
      </div>
    </>
  );
}
