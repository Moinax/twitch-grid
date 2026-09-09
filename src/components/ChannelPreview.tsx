export function ChannelPreview() {
  return (
    <>
      <div id="preview" role="tooltip" hidden>
        <div className="video">
          <div className="player"></div>
          <div className="preview-cover">
            <img className="stream-poster" alt="" decoding="async" />
            <div className="status preview-status">
              <i className="preview-avatar">
                <img alt="" />
              </i>
              <span></span>
            </div>
          </div>
        </div>
        <div className="info">
          <div className="heading">
            <b className="name"></b>
            <span className="viewers" hidden></span>
          </div>
          <div className="category" hidden></div>
          <div className="stream-title" hidden></div>
          <p className="preview-message" role="status" hidden></p>
        </div>
      </div>
    </>
  );
}
