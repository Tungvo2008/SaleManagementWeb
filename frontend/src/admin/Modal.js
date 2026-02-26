import "./modal.css"

export default function Modal({ title, children, footer, onClose, wide, xwide }) {
  return (
    <div className="admModalOverlay" onMouseDown={onClose}>
      <div
        className={`admModal ${xwide ? "admModalXwide" : wide ? "admModalWide" : ""}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="admModalHead">
          <div className="admModalTitle">{title}</div>
          <button className="admBtn" onClick={onClose}>
            Đóng
          </button>
        </div>
        <div className="admModalBody">{children}</div>
        {footer ? <div className="admModalFooter">{footer}</div> : null}
      </div>
    </div>
  )
}
