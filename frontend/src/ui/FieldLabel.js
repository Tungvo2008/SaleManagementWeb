import "./field-label.css"

export default function FieldLabel({ as: Tag = "div", className = "", required = false, children, ...props }) {
  return (
    <Tag className={className} {...props}>
      {children}
      {required ? <span className="requiredMark" aria-hidden="true"> *</span> : null}
    </Tag>
  )
}
