(function() {
    'use strict';

    const GRID_SIZE = 10;
    const SNAP_DISTANCE = 10;
    const RESIZE_HANDLE_SIZE = 8;
    const ANCHOR_SIZE = 6;

    const ToolType = {
        SELECT: 'select',
        CONNECT: 'connect'
    };

    const LineType = {
        STRAIGHT: 'straight',
        POLYLINE: 'polyline',
        CURVE: 'curve'
    };

    const ShapeType = {
        RECTANGLE: 'rectangle',
        ROUNDED_RECTANGLE: 'rounded-rectangle',
        DIAMOND: 'diamond',
        CIRCLE: 'circle',
        PARALLELOGRAM: 'parallelogram',
        TRAPEZOID: 'trapezoid'
    };

    class Point {
        constructor(x = 0, y = 0) {
            this.x = x;
            this.y = y;
        }

        clone() {
            return new Point(this.x, this.y);
        }

        add(p) {
            return new Point(this.x + p.x, this.y + p.y);
        }

        subtract(p) {
            return new Point(this.x - p.x, this.y - p.y);
        }

        distanceTo(p) {
            const dx = this.x - p.x;
            const dy = this.y - p.y;
            return Math.sqrt(dx * dx + dy * dy);
        }
    }

    class Bounds {
        constructor(x = 0, y = 0, width = 0, height = 0) {
            this.x = x;
            this.y = y;
            this.width = width;
            this.height = height;
        }

        get left() { return this.x; }
        get right() { return this.x + this.width; }
        get top() { return this.y; }
        get bottom() { return this.y + this.height; }
        get centerX() { return this.x + this.width / 2; }
        get centerY() { return this.y + this.height / 2; }

        contains(p) {
            return p.x >= this.left && p.x <= this.right &&
                   p.y >= this.top && p.y <= this.bottom;
        }

        intersects(other) {
            return this.left < other.right && this.right > other.left &&
                   this.top < other.bottom && this.bottom > other.top;
        }

        clone() {
            return new Bounds(this.x, this.y, this.width, this.height);
        }
    }

    class Style {
        constructor(options = {}) {
            this.fillColor = options.fillColor || '#ffffff';
            this.strokeColor = options.strokeColor || '#000000';
            this.strokeWidth = options.strokeWidth ?? 2;
            this.fontFamily = options.fontFamily || 'Microsoft YaHei';
            this.fontSize = options.fontSize ?? 14;
            this.fontColor = options.fontColor || '#000000';
            this.textAlign = options.textAlign || 'center';
            this.opacity = options.opacity ?? 1;
        }

        clone() {
            return new Style({
                fillColor: this.fillColor,
                strokeColor: this.strokeColor,
                strokeWidth: this.strokeWidth,
                fontFamily: this.fontFamily,
                fontSize: this.fontSize,
                fontColor: this.fontColor,
                textAlign: this.textAlign,
                opacity: this.opacity
            });
        }

        applyTo(ctx) {
            ctx.fillStyle = this.fillColor;
            ctx.strokeStyle = this.strokeColor;
            ctx.lineWidth = this.strokeWidth;
            ctx.font = `${this.fontSize}px ${this.fontFamily}`;
            ctx.fillStyle = this.fontColor;
            ctx.globalAlpha = this.opacity;
        }
    }

    class Anchor {
        constructor(owner, position) {
            this.owner = owner;
            this.position = position;
            this.connections = [];
        }

        get worldPosition() {
            const bounds = this.owner.bounds;
            switch (this.position) {
                case 'top':
                    return new Point(bounds.centerX, bounds.top);
                case 'bottom':
                    return new Point(bounds.centerX, bounds.bottom);
                case 'left':
                    return new Point(bounds.left, bounds.centerY);
                case 'right':
                    return new Point(bounds.right, bounds.centerY);
                case 'topLeft':
                    return new Point(bounds.left, bounds.top);
                case 'topRight':
                    return new Point(bounds.right, bounds.top);
                case 'bottomLeft':
                    return new Point(bounds.left, bounds.bottom);
                case 'bottomRight':
                    return new Point(bounds.right, bounds.bottom);
                default:
                    return new Point(bounds.centerX, bounds.centerY);
            }
        }

        contains(p) {
            const wp = this.worldPosition;
            return p.distanceTo(wp) < ANCHOR_SIZE * 2;
        }

        addConnection(connection) {
            if (!this.connections.includes(connection)) {
                this.connections.push(connection);
            }
        }

        removeConnection(connection) {
            const index = this.connections.indexOf(connection);
            if (index > -1) {
                this.connections.splice(index, 1);
            }
        }
    }

    class Shape {
        constructor(type, x, y, width, height) {
            this.id = 'shape_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            this.type = type;
            this.bounds = new Bounds(x, y, width, height);
            this.style = new Style();
            this.text = '';
            this.anchors = this.createAnchors();
            this.selected = false;
            this.zIndex = 0;
        }

        createAnchors() {
            return [
                new Anchor(this, 'top'),
                new Anchor(this, 'bottom'),
                new Anchor(this, 'left'),
                new Anchor(this, 'right'),
                new Anchor(this, 'topLeft'),
                new Anchor(this, 'topRight'),
                new Anchor(this, 'bottomLeft'),
                new Anchor(this, 'bottomRight')
            ];
        }

        getAnchor(position) {
            return this.anchors.find(a => a.position === position);
        }

        getNearestAnchor(p) {
            let nearest = null;
            let minDist = Infinity;
            for (const anchor of this.anchors) {
                const dist = anchor.worldPosition.distanceTo(p);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = anchor;
                }
            }
            return nearest;
        }

        contains(p) {
            return this.bounds.contains(p);
        }

        intersectsBounds(bounds) {
            return this.bounds.intersects(bounds);
        }

        move(dx, dy) {
            this.bounds.x += dx;
            this.bounds.y += dy;
            this.updateConnections();
        }

        setPosition(x, y) {
            this.bounds.x = x;
            this.bounds.y = y;
            this.updateConnections();
        }

        setSize(width, height) {
            this.bounds.width = Math.max(20, width);
            this.bounds.height = Math.max(20, height);
            this.updateConnections();
        }

        updateConnections() {
            for (const anchor of this.anchors) {
                for (const conn of anchor.connections) {
                    conn.update();
                }
            }
        }

        getResizeHandles() {
            const b = this.bounds;
            const s = RESIZE_HANDLE_SIZE;
            return [
                { position: 'topLeft', x: b.left - s/2, y: b.top - s/2, width: s, height: s, cursor: 'nw-resize' },
                { position: 'topRight', x: b.right - s/2, y: b.top - s/2, width: s, height: s, cursor: 'ne-resize' },
                { position: 'bottomLeft', x: b.left - s/2, y: b.bottom - s/2, width: s, height: s, cursor: 'sw-resize' },
                { position: 'bottomRight', x: b.right - s/2, y: b.bottom - s/2, width: s, height: s, cursor: 'se-resize' },
                { position: 'top', x: b.centerX - s/2, y: b.top - s/2, width: s, height: s, cursor: 'n-resize' },
                { position: 'bottom', x: b.centerX - s/2, y: b.bottom - s/2, width: s, height: s, cursor: 's-resize' },
                { position: 'left', x: b.left - s/2, y: b.centerY - s/2, width: s, height: s, cursor: 'w-resize' },
                { position: 'right', x: b.right - s/2, y: b.centerY - s/2, width: s, height: s, cursor: 'e-resize' }
            ];
        }

        getResizeHandleAt(p) {
            const handles = this.getResizeHandles();
            for (const handle of handles) {
                if (p.x >= handle.x && p.x <= handle.x + handle.width &&
                    p.y >= handle.y && p.y <= handle.y + handle.height) {
                    return handle;
                }
            }
            return null;
        }

        draw(ctx) {
            this.style.applyTo(ctx);
            ctx.beginPath();
            this.drawPath(ctx);
            
            if (this.style.fillColor !== 'transparent') {
                ctx.fillStyle = this.style.fillColor;
                ctx.fill();
            }
            
            if (this.style.strokeWidth > 0) {
                ctx.strokeStyle = this.style.strokeColor;
                ctx.lineWidth = this.style.strokeWidth;
                ctx.stroke();
            }

            if (this.text) {
                this.drawText(ctx);
            }

            ctx.globalAlpha = 1;
        }

        drawPath(ctx) {
            const b = this.bounds;
            switch (this.type) {
                case ShapeType.RECTANGLE:
                    ctx.rect(b.x, b.y, b.width, b.height);
                    break;
                case ShapeType.ROUNDED_RECTANGLE:
                    const r = Math.min(10, b.width / 2, b.height / 2);
                    const x = b.x, y = b.y, w = b.width, h = b.height;
                    ctx.moveTo(x + r, y);
                    ctx.lineTo(x + w - r, y);
                    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
                    ctx.lineTo(x + w, y + h - r);
                    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
                    ctx.lineTo(x + r, y + h);
                    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
                    ctx.lineTo(x, y + r);
                    ctx.quadraticCurveTo(x, y, x + r, y);
                    ctx.closePath();
                    break;
                case ShapeType.DIAMOND:
                    ctx.moveTo(b.centerX, b.top);
                    ctx.lineTo(b.right, b.centerY);
                    ctx.lineTo(b.centerX, b.bottom);
                    ctx.lineTo(b.left, b.centerY);
                    ctx.closePath();
                    break;
                case ShapeType.CIRCLE:
                    const rx = b.width / 2;
                    const ry = b.height / 2;
                    ctx.ellipse(b.centerX, b.centerY, rx, ry, 0, 0, Math.PI * 2);
                    break;
                case ShapeType.PARALLELOGRAM:
                    const offset = b.width * 0.15;
                    ctx.moveTo(b.left + offset, b.top);
                    ctx.lineTo(b.right, b.top);
                    ctx.lineTo(b.right - offset, b.bottom);
                    ctx.lineTo(b.left, b.bottom);
                    ctx.closePath();
                    break;
                case ShapeType.TRAPEZOID:
                    const topOffset = b.width * 0.2;
                    ctx.moveTo(b.left + topOffset, b.top);
                    ctx.lineTo(b.right - topOffset, b.top);
                    ctx.lineTo(b.right, b.bottom);
                    ctx.lineTo(b.left, b.bottom);
                    ctx.closePath();
                    break;
            }
        }

        drawText(ctx) {
            const b = this.bounds;
            ctx.font = `${this.style.fontSize}px ${this.style.fontFamily}`;
            ctx.fillStyle = this.style.fontColor;
            ctx.textBaseline = 'top';

            const lines = this.text.split('\n');
            const lineHeight = this.style.fontSize * 1.4;
            const totalHeight = lines.length * lineHeight;
            const padding = 8;
            const availableWidth = b.width - padding * 2;
            
            let startY = b.y + padding;
            
            if (this.style.textAlign === 'center') {
                startY = b.centerY - totalHeight / 2;
            } else if (this.style.textAlign === 'right') {
                startY = b.y + padding;
            }

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const metrics = ctx.measureText(line);
                const textWidth = metrics.width;
                
                let x = b.x + padding;
                if (this.style.textAlign === 'center') {
                    x = b.centerX - textWidth / 2;
                } else if (this.style.textAlign === 'right') {
                    x = b.right - padding - textWidth;
                }
                
                x = Math.max(b.x + padding, Math.min(x, b.right - padding - textWidth));
                
                ctx.fillText(line, x, startY + i * lineHeight);
            }
        }

        drawSelection(ctx) {
            const b = this.bounds;
            ctx.save();
            
            ctx.strokeStyle = '#007acc';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(b.x - 2, b.y - 2, b.width + 4, b.height + 4);
            
            ctx.setLineDash([]);
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#007acc';
            ctx.lineWidth = 1;
            
            const handles = this.getResizeHandles();
            for (const handle of handles) {
                ctx.fillRect(handle.x, handle.y, handle.width, handle.height);
                ctx.strokeRect(handle.x, handle.y, handle.width, handle.height);
            }
            
            ctx.restore();
        }

        drawAnchors(ctx, highlightAnchor = null) {
            ctx.save();
            for (const anchor of this.anchors) {
                const wp = anchor.worldPosition;
                const isHighlighted = highlightAnchor === anchor;
                
                ctx.fillStyle = isHighlighted ? '#ff0000' : '#007acc';
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                
                ctx.beginPath();
                ctx.arc(wp.x, wp.y, ANCHOR_SIZE, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }
            ctx.restore();
        }

        clone() {
            const shape = new Shape(this.type, this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height);
            shape.style = this.style.clone();
            shape.text = this.text;
            shape.zIndex = this.zIndex;
            return shape;
        }
    }

    class Connection {
        constructor(startAnchor, endAnchor, lineType = LineType.STRAIGHT) {
            this.id = 'conn_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            this.startAnchor = startAnchor;
            this.endAnchor = endAnchor;
            this.lineType = lineType;
            this.style = new Style({ fillColor: 'transparent', strokeColor: '#000000', strokeWidth: 2 });
            this.selected = false;
            
            this.startAnchor.addConnection(this);
            this.endAnchor.addConnection(this);
            
            this.points = [];
            this.update();
        }

        get startPoint() {
            return this.startAnchor.worldPosition;
        }

        get endPoint() {
            return this.endAnchor.worldPosition;
        }

        update() {
            this.calculatePoints();
        }

        calculatePoints() {
            const start = this.startPoint;
            const end = this.endPoint;
            
            switch (this.lineType) {
                case LineType.STRAIGHT:
                    this.points = [start.clone(), end.clone()];
                    break;
                case LineType.POLYLINE:
                    this.points = this.calculatePolylinePoints(start, end);
                    break;
                case LineType.CURVE:
                    this.points = this.calculateCurvePoints(start, end);
                    break;
            }
        }

        calculatePolylinePoints(start, end) {
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const midX = start.x + dx / 2;
            const midY = start.y + dy / 2;
            
            if (Math.abs(dx) > Math.abs(dy)) {
                return [
                    start.clone(),
                    new Point(midX, start.y),
                    new Point(midX, end.y),
                    end.clone()
                ];
            } else {
                return [
                    start.clone(),
                    new Point(start.x, midY),
                    new Point(end.x, midY),
                    end.clone()
                ];
            }
        }

        calculateCurvePoints(start, end) {
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const offset = Math.min(Math.abs(dx), Math.abs(dy)) * 0.5 || 50;
            
            let cp1x = start.x;
            let cp1y = start.y;
            let cp2x = end.x;
            let cp2y = end.y;
            
            const startPos = this.startAnchor.position;
            const endPos = this.endAnchor.position;
            
            if (startPos === 'right' || startPos === 'left') {
                cp1x = start.x + (startPos === 'right' ? offset : -offset);
            } else {
                cp1y = start.y + (startPos === 'bottom' ? offset : -offset);
            }
            
            if (endPos === 'right' || endPos === 'left') {
                cp2x = end.x + (endPos === 'right' ? offset : -offset);
            } else {
                cp2y = end.y + (endPos === 'bottom' ? offset : -offset);
            }
            
            return [
                start.clone(),
                new Point(cp1x, cp1y),
                new Point(cp2x, cp2y),
                end.clone()
            ];
        }

        contains(p, threshold = 10) {
            if (this.points.length < 2) return false;
            
            for (let i = 0; i < this.points.length - 1; i++) {
                const p1 = this.points[i];
                const p2 = this.points[i + 1];
                
                if (this.lineType === LineType.CURVE && i === 0 && this.points.length === 4) {
                    if (this.isPointNearBezier(p, this.points[0], this.points[1], this.points[2], this.points[3], threshold)) {
                        return true;
                    }
                    break;
                } else {
                    if (this.isPointNearLine(p, p1, p2, threshold)) {
                        return true;
                    }
                }
            }
            return false;
        }

        isPointNearLine(p, p1, p2, threshold) {
            const lineLength = p1.distanceTo(p2);
            if (lineLength === 0) return p.distanceTo(p1) < threshold;
            
            const t = Math.max(0, Math.min(1, 
                ((p.x - p1.x) * (p2.x - p1.x) + (p.y - p1.y) * (p2.y - p1.y)) / (lineLength * lineLength)
            ));
            
            const projection = new Point(
                p1.x + t * (p2.x - p1.x),
                p1.y + t * (p2.y - p1.y)
            );
            
            return p.distanceTo(projection) < threshold;
        }

        isPointNearBezier(p, p0, p1, p2, p3, threshold) {
            for (let t = 0; t <= 1; t += 0.05) {
                const mt = 1 - t;
                const bp = new Point(
                    mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
                    mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y
                );
                if (p.distanceTo(bp) < threshold) return true;
            }
            return false;
        }

        draw(ctx) {
            if (this.points.length < 2) return;
            
            ctx.save();
            this.style.applyTo(ctx);
            
            ctx.beginPath();
            
            if (this.lineType === LineType.STRAIGHT || this.lineType === LineType.POLYLINE) {
                ctx.moveTo(this.points[0].x, this.points[0].y);
                for (let i = 1; i < this.points.length; i++) {
                    ctx.lineTo(this.points[i].x, this.points[i].y);
                }
            } else if (this.lineType === LineType.CURVE && this.points.length === 4) {
                ctx.moveTo(this.points[0].x, this.points[0].y);
                ctx.bezierCurveTo(
                    this.points[1].x, this.points[1].y,
                    this.points[2].x, this.points[2].y,
                    this.points[3].x, this.points[3].y
                );
            }
            
            ctx.strokeStyle = this.style.strokeColor;
            ctx.lineWidth = this.style.strokeWidth;
            ctx.stroke();
            
            this.drawArrow(ctx);
            
            if (this.selected) {
                this.drawSelection(ctx);
            }
            
            ctx.restore();
        }

        drawArrow(ctx) {
            if (this.points.length < 2) return;
            
            const end = this.points[this.points.length - 1];
            const prev = this.points[this.points.length - 2];
            
            const angle = Math.atan2(end.y - prev.y, end.x - prev.x);
            const arrowLength = 10;
            const arrowAngle = Math.PI / 6;
            
            ctx.save();
            ctx.fillStyle = this.style.strokeColor;
            ctx.beginPath();
            ctx.moveTo(end.x, end.y);
            ctx.lineTo(
                end.x - arrowLength * Math.cos(angle - arrowAngle),
                end.y - arrowLength * Math.sin(angle - arrowAngle)
            );
            ctx.lineTo(
                end.x - arrowLength * Math.cos(angle + arrowAngle),
                end.y - arrowLength * Math.sin(angle + arrowAngle)
            );
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        drawSelection(ctx) {
            ctx.save();
            ctx.strokeStyle = '#007acc';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            
            if (this.points.length >= 2) {
                const minX = Math.min(...this.points.map(p => p.x)) - 5;
                const maxX = Math.max(...this.points.map(p => p.x)) + 5;
                const minY = Math.min(...this.points.map(p => p.y)) - 5;
                const maxY = Math.max(...this.points.map(p => p.y)) + 5;
                
                ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
            }
            
            ctx.setLineDash([]);
            ctx.restore();
        }

        destroy() {
            this.startAnchor.removeConnection(this);
            this.endAnchor.removeConnection(this);
        }
    }

    class Selection {
        constructor() {
            this.shapes = [];
            this.connections = [];
        }

        get isEmpty() {
            return this.shapes.length === 0 && this.connections.length === 0;
        }

        get hasShapes() {
            return this.shapes.length > 0;
        }

        get hasConnections() {
            return this.connections.length > 0;
        }

        get hasSingleShape() {
            return this.shapes.length === 1 && this.connections.length === 0;
        }

        get singleShape() {
            return this.hasSingleShape ? this.shapes[0] : null;
        }

        clear() {
            for (const shape of this.shapes) {
                shape.selected = false;
            }
            for (const conn of this.connections) {
                conn.selected = false;
            }
            this.shapes = [];
            this.connections = [];
        }

        addShape(shape) {
            if (!this.shapes.includes(shape)) {
                shape.selected = true;
                this.shapes.push(shape);
            }
        }

        removeShape(shape) {
            const index = this.shapes.indexOf(shape);
            if (index > -1) {
                shape.selected = false;
                this.shapes.splice(index, 1);
            }
        }

        toggleShape(shape) {
            if (this.shapes.includes(shape)) {
                this.removeShape(shape);
            } else {
                this.addShape(shape);
            }
        }

        addConnection(conn) {
            if (!this.connections.includes(conn)) {
                conn.selected = true;
                this.connections.push(conn);
            }
        }

        removeConnection(conn) {
            const index = this.connections.indexOf(conn);
            if (index > -1) {
                conn.selected = false;
                this.connections.splice(index, 1);
            }
        }

        setShapes(shapes) {
            this.clear();
            for (const shape of shapes) {
                this.addShape(shape);
            }
        }

        setConnection(conn) {
            this.clear();
            this.addConnection(conn);
        }

        containsShape(shape) {
            return this.shapes.includes(shape);
        }

        containsConnection(conn) {
            return this.connections.includes(conn);
        }

        getBounds() {
            if (this.isEmpty) return null;
            
            let minX = Infinity, minY = Infinity;
            let maxX = -Infinity, maxY = -Infinity;
            
            for (const shape of this.shapes) {
                minX = Math.min(minX, shape.bounds.left);
                minY = Math.min(minY, shape.bounds.top);
                maxX = Math.max(maxX, shape.bounds.right);
                maxY = Math.max(maxY, shape.bounds.bottom);
            }
            
            for (const conn of this.connections) {
                for (const p of conn.points) {
                    minX = Math.min(minX, p.x);
                    minY = Math.min(minY, p.y);
                    maxX = Math.max(maxX, p.x);
                    maxY = Math.max(maxY, p.y);
                }
            }
            
            return new Bounds(minX, minY, maxX - minX, maxY - minY);
        }
    }

    class FlowChartApp {
        constructor() {
            this.shapes = [];
            this.connections = [];
            this.selection = new Selection();
            
            this.canvas = document.getElementById('main-canvas');
            this.overlayCanvas = document.getElementById('overlay-canvas');
            this.ctx = this.canvas.getContext('2d');
            this.overlayCtx = this.overlayCanvas.getContext('2d');
            
            this.textEditor = document.getElementById('text-editor');
            this.canvasWrapper = document.getElementById('canvas-wrapper');
            
            this.currentTool = ToolType.SELECT;
            this.lineType = LineType.STRAIGHT;
            
            this.isDragging = false;
            this.isResizing = false;
            this.isConnecting = false;
            this.isSelecting = false;
            this.isEditingText = false;
            
            this.dragStartPos = new Point();
            this.dragOffset = new Point();
            this.resizeHandle = null;
            this.resizeStartBounds = null;
            this.connectionStart = null;
            this.connectionEnd = null;
            this.selectionStartPos = new Point();
            this.selectionEndPos = new Point();
            this.mousePos = new Point();
            
            this.highlightedAnchor = null;
            this.hoveredShape = null;
            this.dragStartShapes = [];
            
            this.init();
        }

        init() {
            this.setupCanvas();
            this.setupEventListeners();
            this.renderShapePreviews();
            this.render();
        }

        setupCanvas() {
            const resizeCanvas = () => {
                const rect = this.canvasWrapper.getBoundingClientRect();
                const width = Math.max(rect.width, 2000);
                const height = Math.max(rect.height, 2000);
                
                this.canvas.width = width;
                this.canvas.height = height;
                this.overlayCanvas.width = width;
                this.overlayCanvas.height = height;
                
                this.render();
            };
            
            window.addEventListener('resize', resizeCanvas);
            resizeCanvas();
        }

        setupEventListeners() {
            document.getElementById('btn-select').addEventListener('click', () => this.setTool(ToolType.SELECT));
            document.getElementById('btn-connect').addEventListener('click', () => this.setTool(ToolType.CONNECT));
            document.getElementById('line-type').addEventListener('change', (e) => {
                this.lineType = e.target.value;
                this.updateSelectionLineType();
            });
            
            document.getElementById('btn-delete').addEventListener('click', () => this.deleteSelection());
            document.getElementById('btn-clear').addEventListener('click', () => this.clearAll());
            
            document.getElementById('btn-export-png').addEventListener('click', () => this.exportPNG());
            document.getElementById('btn-export-pdf').addEventListener('click', () => this.exportPDF());
            document.getElementById('btn-export-svg').addEventListener('click', () => this.exportSVG());
            
            this.setupPropertyListeners();
            this.setupCanvasEventListeners();
            this.setupDragDropListeners();
            this.setupKeyboardListeners();
        }

        setupPropertyListeners() {
            const propFillColor = document.getElementById('prop-fill-color');
            const propStrokeColor = document.getElementById('prop-stroke-color');
            const propStrokeWidth = document.getElementById('prop-stroke-width');
            const propFontFamily = document.getElementById('prop-font-family');
            const propFontSize = document.getElementById('prop-font-size');
            const propFontColor = document.getElementById('prop-font-color');
            const propOpacity = document.getElementById('prop-opacity');
            const propX = document.getElementById('prop-x');
            const propY = document.getElementById('prop-y');
            const propWidth = document.getElementById('prop-width');
            const propHeight = document.getElementById('prop-height');
            
            propFillColor.addEventListener('change', (e) => {
                if (this.selection.hasSingleShape) {
                    this.selection.singleShape.style.fillColor = e.target.value;
                    this.render();
                }
            });
            
            propStrokeColor.addEventListener('change', (e) => {
                if (this.selection.hasSingleShape) {
                    this.selection.singleShape.style.strokeColor = e.target.value;
                    this.render();
                }
                if (this.selection.hasConnections) {
                    for (const conn of this.selection.connections) {
                        conn.style.strokeColor = e.target.value;
                    }
                    this.render();
                }
            });
            
            propStrokeWidth.addEventListener('change', (e) => {
                if (this.selection.hasSingleShape) {
                    this.selection.singleShape.style.strokeWidth = parseInt(e.target.value);
                    this.render();
                }
                if (this.selection.hasConnections) {
                    for (const conn of this.selection.connections) {
                        conn.style.strokeWidth = parseInt(e.target.value);
                    }
                    this.render();
                }
            });
            
            propFontFamily.addEventListener('change', (e) => {
                if (this.selection.hasSingleShape) {
                    this.selection.singleShape.style.fontFamily = e.target.value;
                    this.render();
                }
            });
            
            propFontSize.addEventListener('change', (e) => {
                if (this.selection.hasSingleShape) {
                    this.selection.singleShape.style.fontSize = parseInt(e.target.value);
                    this.render();
                }
            });
            
            propFontColor.addEventListener('change', (e) => {
                if (this.selection.hasSingleShape) {
                    this.selection.singleShape.style.fontColor = e.target.value;
                    this.render();
                }
            });
            
            propOpacity.addEventListener('input', (e) => {
                if (this.selection.hasSingleShape) {
                    this.selection.singleShape.style.opacity = parseInt(e.target.value) / 100;
                    this.render();
                }
            });
            
            propX.addEventListener('change', (e) => {
                if (this.selection.hasSingleShape) {
                    this.selection.singleShape.setPosition(parseInt(e.target.value), this.selection.singleShape.bounds.y);
                    this.render();
                }
            });
            
            propY.addEventListener('change', (e) => {
                if (this.selection.hasSingleShape) {
                    this.selection.singleShape.setPosition(this.selection.singleShape.bounds.x, parseInt(e.target.value));
                    this.render();
                }
            });
            
            propWidth.addEventListener('change', (e) => {
                if (this.selection.hasSingleShape) {
                    this.selection.singleShape.setSize(parseInt(e.target.value), this.selection.singleShape.bounds.height);
                    this.render();
                }
            });
            
            propHeight.addEventListener('change', (e) => {
                if (this.selection.hasSingleShape) {
                    this.selection.singleShape.setSize(this.selection.singleShape.bounds.width, parseInt(e.target.value));
                    this.render();
                }
            });
            
            document.querySelectorAll('.align-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    document.querySelectorAll('.align-btn').forEach(b => b.classList.remove('active'));
                    e.currentTarget.classList.add('active');
                    
                    if (this.selection.hasSingleShape) {
                        this.selection.singleShape.style.textAlign = e.currentTarget.dataset.align;
                        this.render();
                    }
                });
            });
        }

        setupCanvasEventListeners() {
            this.overlayCanvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
            this.overlayCanvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
            this.overlayCanvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
            this.overlayCanvas.addEventListener('mouseleave', (e) => this.onMouseLeave(e));
            this.overlayCanvas.addEventListener('dblclick', (e) => this.onDoubleClick(e));
            this.overlayCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
        }

        setupDragDropListeners() {
            const shapeItems = document.querySelectorAll('.shape-item');
            shapeItems.forEach(item => {
                item.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('shapeType', item.dataset.shape);
                });
                
                item.addEventListener('click', (e) => {
                    const shapeType = item.dataset.shape;
                    const canvasRect = this.overlayCanvas.getBoundingClientRect();
                    const centerX = 200;
                    const centerY = 150;
                    this.createShape(shapeType, centerX, centerY, 100, 60);
                });
                
                item.style.cursor = 'pointer';
            });
            
            this.overlayCanvas.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
            });
            
            this.overlayCanvas.addEventListener('drop', (e) => {
                e.preventDefault();
                const shapeType = e.dataTransfer.getData('shapeType');
                if (shapeType) {
                    const pos = this.getCanvasPos(e);
                    this.createShape(shapeType, pos.x - 50, pos.y - 30, 100, 60);
                }
            });
        }

        setupKeyboardListeners() {
            document.addEventListener('keydown', (e) => {
                if (this.isEditingText) return;
                
                switch (e.key) {
                    case 'v':
                    case 'V':
                        this.setTool(ToolType.SELECT);
                        break;
                    case 'c':
                    case 'C':
                        this.setTool(ToolType.CONNECT);
                        break;
                    case 'Delete':
                    case 'Backspace':
                        if (!e.ctrlKey && !e.metaKey) {
                            this.deleteSelection();
                        }
                        break;
                    case 'Escape':
                        this.cancelCurrentAction();
                        break;
                }
            });
        }

        setTool(tool) {
            this.currentTool = tool;
            document.getElementById('btn-select').classList.toggle('active', tool === ToolType.SELECT);
            document.getElementById('btn-connect').classList.toggle('active', tool === ToolType.CONNECT);
        }

        updateSelectionLineType() {
            if (this.selection.hasConnections) {
                for (const conn of this.selection.connections) {
                    conn.lineType = this.lineType;
                    conn.update();
                }
                this.render();
            }
        }

        getCanvasPos(e) {
            const rect = this.overlayCanvas.getBoundingClientRect();
            return new Point(
                e.clientX - rect.left,
                e.clientY - rect.top
            );
        }

        onMouseDown(e) {
            const pos = this.getCanvasPos(e);
            this.dragStartPos = pos.clone();
            this.mousePos = pos.clone();
            
            if (e.button !== 0) return;
            
            this.cancelTextEdit();
            
            if (this.currentTool === ToolType.SELECT) {
                this.handleSelectMouseDown(pos, e);
            } else if (this.currentTool === ToolType.CONNECT) {
                this.handleConnectMouseDown(pos);
            }
        }

        handleSelectMouseDown(pos, e) {
            if (this.selection.hasSingleShape) {
                const handle = this.selection.singleShape.getResizeHandleAt(pos);
                if (handle) {
                    this.isResizing = true;
                    this.resizeHandle = handle;
                    this.resizeStartBounds = this.selection.singleShape.bounds.clone();
                    this.dragStartPos = pos.clone();
                    return;
                }
            }
            
            const shape = this.getShapeAt(pos);
            const conn = this.getConnectionAt(pos);
            
            if (e.shiftKey) {
                if (shape) {
                    this.selection.toggleShape(shape);
                    if (this.selection.containsShape(shape)) {
                        this.isDragging = true;
                        this.dragStartPos = pos.clone();
                        this.saveDragStartPositions();
                    }
                } else if (conn) {
                    this.selection.setConnection(conn);
                } else {
                    this.isSelecting = true;
                    this.selectionStartPos = pos.clone();
                    this.selectionEndPos = pos.clone();
                }
            } else {
                if (shape) {
                    if (!this.selection.containsShape(shape)) {
                        this.selection.setShapes([shape]);
                    }
                    this.isDragging = true;
                    this.dragStartPos = pos.clone();
                    this.saveDragStartPositions();
                } else if (conn) {
                    this.selection.setConnection(conn);
                } else {
                    this.selection.clear();
                    this.isSelecting = true;
                    this.selectionStartPos = pos.clone();
                    this.selectionEndPos = pos.clone();
                }
            }
            
            this.updatePropertyPanel();
            this.render();
        }

        saveDragStartPositions() {
            this.dragStartShapes = [];
            for (const shape of this.selection.shapes) {
                this.dragStartShapes.push({
                    shape: shape,
                    startX: shape.bounds.x,
                    startY: shape.bounds.y
                });
            }
        }

        handleConnectMouseDown(pos) {
            const anchor = this.getAnchorAt(pos);
            if (anchor) {
                this.isConnecting = true;
                this.connectionStart = anchor;
                this.connectionEnd = null;
            }
        }

        onMouseMove(e) {
            const pos = this.getCanvasPos(e);
            this.mousePos = pos.clone();
            
            if (this.isResizing) {
                this.handleResize(pos);
            } else if (this.isDragging) {
                this.handleDrag(pos);
            } else if (this.isConnecting) {
                this.handleConnectMove(pos);
            } else if (this.isSelecting) {
                this.handleSelectMove(pos);
            } else {
                this.handleHover(pos);
            }
        }

        handleResize(pos) {
            if (!this.resizeHandle || !this.resizeStartBounds || !this.selection.hasSingleShape) return;
            
            const shape = this.selection.singleShape;
            const dx = pos.x - this.dragStartPos.x;
            const dy = pos.y - this.dragStartPos.y;
            
            let newX = this.resizeStartBounds.x;
            let newY = this.resizeStartBounds.y;
            let newWidth = this.resizeStartBounds.width;
            let newHeight = this.resizeStartBounds.height;
            
            switch (this.resizeHandle.position) {
                case 'topLeft':
                    newX = this.resizeStartBounds.x + dx;
                    newY = this.resizeStartBounds.y + dy;
                    newWidth = this.resizeStartBounds.width - dx;
                    newHeight = this.resizeStartBounds.height - dy;
                    break;
                case 'topRight':
                    newY = this.resizeStartBounds.y + dy;
                    newWidth = this.resizeStartBounds.width + dx;
                    newHeight = this.resizeStartBounds.height - dy;
                    break;
                case 'bottomLeft':
                    newX = this.resizeStartBounds.x + dx;
                    newWidth = this.resizeStartBounds.width - dx;
                    newHeight = this.resizeStartBounds.height + dy;
                    break;
                case 'bottomRight':
                    newWidth = this.resizeStartBounds.width + dx;
                    newHeight = this.resizeStartBounds.height + dy;
                    break;
                case 'top':
                    newY = this.resizeStartBounds.y + dy;
                    newHeight = this.resizeStartBounds.height - dy;
                    break;
                case 'bottom':
                    newHeight = this.resizeStartBounds.height + dy;
                    break;
                case 'left':
                    newX = this.resizeStartBounds.x + dx;
                    newWidth = this.resizeStartBounds.width - dx;
                    break;
                case 'right':
                    newWidth = this.resizeStartBounds.width + dx;
                    break;
            }
            
            if (newWidth >= 20) {
                shape.bounds.x = newX;
                shape.bounds.width = newWidth;
            }
            if (newHeight >= 20) {
                shape.bounds.y = newY;
                shape.bounds.height = newHeight;
            }
            
            shape.updateConnections();
            this.updatePropertyPanel();
            this.render();
        }

        handleDrag(pos) {
            if (!this.selection.hasShapes || this.dragStartShapes.length === 0) return;
            
            const totalDx = pos.x - this.dragStartPos.x;
            const totalDy = pos.y - this.dragStartPos.y;
            
            let finalDx = totalDx;
            let finalDy = totalDy;
            
            if (this.selection.hasSingleShape && this.dragStartShapes.length > 0) {
                const snapInfo = this.calculateSnap(this.dragStartShapes[0], totalDx, totalDy);
                if (snapInfo.snapX !== null) finalDx = snapInfo.snapX;
                if (snapInfo.snapY !== null) finalDy = snapInfo.snapY;
            }
            
            for (const item of this.dragStartShapes) {
                item.shape.setPosition(item.startX + finalDx, item.startY + finalDy);
            }
            
            this.updatePropertyPanel();
            this.render();
        }

        calculateSnap(startItem, totalDx, totalDy) {
            const result = { snapX: null, snapY: null };
            const startX = startItem.startX;
            const startY = startItem.startY;
            const shape = startItem.shape;
            const w = shape.bounds.width;
            const h = shape.bounds.height;
            
            const targetLeft = startX + totalDx;
            const targetRight = targetLeft + w;
            const targetCenterX = targetLeft + w / 2;
            const targetTop = startY + totalDy;
            const targetBottom = targetTop + h;
            const targetCenterY = targetTop + h / 2;
            
            for (const other of this.shapes) {
                if (other === shape || this.selection.containsShape(other)) continue;
                
                const fixed = other.bounds;
                
                if (Math.abs(targetLeft - fixed.left) < SNAP_DISTANCE) {
                    result.snapX = fixed.left - startX;
                } else if (Math.abs(targetRight - fixed.right) < SNAP_DISTANCE) {
                    result.snapX = fixed.right - startX - w;
                } else if (Math.abs(targetCenterX - fixed.centerX) < SNAP_DISTANCE) {
                    result.snapX = fixed.centerX - startX - w / 2;
                } else if (Math.abs(targetRight - fixed.left) < SNAP_DISTANCE) {
                    result.snapX = fixed.left - startX - w;
                } else if (Math.abs(targetLeft - fixed.right) < SNAP_DISTANCE) {
                    result.snapX = fixed.right - startX;
                }
                
                if (Math.abs(targetTop - fixed.top) < SNAP_DISTANCE) {
                    result.snapY = fixed.top - startY;
                } else if (Math.abs(targetBottom - fixed.bottom) < SNAP_DISTANCE) {
                    result.snapY = fixed.bottom - startY - h;
                } else if (Math.abs(targetCenterY - fixed.centerY) < SNAP_DISTANCE) {
                    result.snapY = fixed.centerY - startY - h / 2;
                } else if (Math.abs(targetBottom - fixed.top) < SNAP_DISTANCE) {
                    result.snapY = fixed.top - startY - h;
                } else if (Math.abs(targetTop - fixed.bottom) < SNAP_DISTANCE) {
                    result.snapY = fixed.bottom - startY;
                }
            }
            
            return result;
        }

        getSnapInfo(movingShape, dx, dy) {
            const result = { snapX: null, snapY: null };
            const movingBounds = new Bounds(
                movingShape.bounds.x + dx,
                movingShape.bounds.y + dy,
                movingShape.bounds.width,
                movingShape.bounds.height
            );
            
            for (const shape of this.shapes) {
                if (shape === movingShape || this.selection.containsShape(shape)) continue;
                
                const fixed = shape.bounds;
                
                if (Math.abs(movingBounds.left - fixed.left) < SNAP_DISTANCE) {
                    result.snapX = fixed.left - movingShape.bounds.left;
                } else if (Math.abs(movingBounds.right - fixed.right) < SNAP_DISTANCE) {
                    result.snapX = fixed.right - movingShape.bounds.right;
                } else if (Math.abs(movingBounds.centerX - fixed.centerX) < SNAP_DISTANCE) {
                    result.snapX = fixed.centerX - movingShape.bounds.centerX;
                } else if (Math.abs(movingBounds.right - fixed.left) < SNAP_DISTANCE) {
                    result.snapX = fixed.left - movingShape.bounds.right;
                } else if (Math.abs(movingBounds.left - fixed.right) < SNAP_DISTANCE) {
                    result.snapX = fixed.right - movingShape.bounds.left;
                }
                
                if (Math.abs(movingBounds.top - fixed.top) < SNAP_DISTANCE) {
                    result.snapY = fixed.top - movingShape.bounds.top;
                } else if (Math.abs(movingBounds.bottom - fixed.bottom) < SNAP_DISTANCE) {
                    result.snapY = fixed.bottom - movingShape.bounds.bottom;
                } else if (Math.abs(movingBounds.centerY - fixed.centerY) < SNAP_DISTANCE) {
                    result.snapY = fixed.centerY - movingShape.bounds.centerY;
                } else if (Math.abs(movingBounds.bottom - fixed.top) < SNAP_DISTANCE) {
                    result.snapY = fixed.top - movingShape.bounds.bottom;
                } else if (Math.abs(movingBounds.top - fixed.bottom) < SNAP_DISTANCE) {
                    result.snapY = fixed.bottom - movingShape.bounds.top;
                }
            }
            
            return result;
        }

        handleConnectMove(pos) {
            const anchor = this.getAnchorAt(pos);
            this.highlightedAnchor = anchor;
            
            if (anchor && anchor !== this.connectionStart) {
                this.connectionEnd = anchor;
            } else {
                this.connectionEnd = null;
            }
            
            this.render();
        }

        handleSelectMove(pos) {
            this.selectionEndPos = pos.clone();
            this.render();
        }

        handleHover(pos) {
            let cursor = 'default';
            this.highlightedAnchor = null;
            
            if (this.currentTool === ToolType.SELECT) {
                if (this.selection.hasSingleShape) {
                    const handle = this.selection.singleShape.getResizeHandleAt(pos);
                    if (handle) {
                        cursor = handle.cursor;
                    }
                }
                
                const anchor = this.getAnchorAt(pos);
                if (anchor) {
                    this.highlightedAnchor = anchor;
                    cursor = 'crosshair';
                }
                
                const conn = this.getConnectionAt(pos);
                if (conn) {
                    cursor = 'pointer';
                }
            } else if (this.currentTool === ToolType.CONNECT) {
                const anchor = this.getAnchorAt(pos);
                if (anchor) {
                    this.highlightedAnchor = anchor;
                    cursor = 'crosshair';
                }
            }
            
            this.overlayCanvas.style.cursor = cursor;
            this.render();
        }

        onMouseUp(e) {
            const pos = this.getCanvasPos(e);
            
            if (this.isResizing) {
                this.isResizing = false;
                this.resizeHandle = null;
                this.resizeStartBounds = null;
            } else if (this.isDragging) {
                this.isDragging = false;
            } else if (this.isConnecting) {
                this.finishConnection();
            } else if (this.isSelecting) {
                this.finishSelection();
            }
            
            this.render();
        }

        onMouseLeave(e) {
            this.highlightedAnchor = null;
            this.render();
        }

        onDoubleClick(e) {
            const pos = this.getCanvasPos(e);
            
            const shape = this.getShapeAt(pos);
            if (shape) {
                this.startTextEdit(shape);
            }
        }

        finishConnection() {
            if (this.connectionStart && this.connectionEnd) {
                const exists = this.connections.some(c => 
                    (c.startAnchor === this.connectionStart && c.endAnchor === this.connectionEnd) ||
                    (c.startAnchor === this.connectionEnd && c.endAnchor === this.connectionStart)
                );
                
                if (!exists) {
                    const conn = new Connection(this.connectionStart, this.connectionEnd, this.lineType);
                    this.connections.push(conn);
                }
            }
            
            this.isConnecting = false;
            this.connectionStart = null;
            this.connectionEnd = null;
            this.highlightedAnchor = null;
        }

        finishSelection() {
            const selBounds = this.getSelectionBounds();
            if (selBounds) {
                const selectedShapes = [];
                for (const shape of this.shapes) {
                    if (shape.intersectsBounds(selBounds)) {
                        selectedShapes.push(shape);
                    }
                }
                
                if (selectedShapes.length > 0) {
                    this.selection.setShapes(selectedShapes);
                    this.updatePropertyPanel();
                }
            }
            
            this.isSelecting = false;
        }

        getSelectionBounds() {
            if (!this.isSelecting) return null;
            
            const x = Math.min(this.selectionStartPos.x, this.selectionEndPos.x);
            const y = Math.min(this.selectionStartPos.y, this.selectionEndPos.y);
            const width = Math.abs(this.selectionEndPos.x - this.selectionStartPos.x);
            const height = Math.abs(this.selectionEndPos.y - this.selectionStartPos.y);
            
            if (width < 5 && height < 5) return null;
            
            return new Bounds(x, y, width, height);
        }

        cancelCurrentAction() {
            this.isDragging = false;
            this.isResizing = false;
            this.isConnecting = false;
            this.isSelecting = false;
            this.connectionStart = null;
            this.connectionEnd = null;
            this.highlightedAnchor = null;
            this.cancelTextEdit();
            this.render();
        }

        getShapeAt(pos) {
            for (let i = this.shapes.length - 1; i >= 0; i--) {
                if (this.shapes[i].contains(pos)) {
                    return this.shapes[i];
                }
            }
            return null;
        }

        getConnectionAt(pos) {
            for (let i = this.connections.length - 1; i >= 0; i--) {
                if (this.connections[i].contains(pos)) {
                    return this.connections[i];
                }
            }
            return null;
        }

        getAnchorAt(pos) {
            for (const shape of this.shapes) {
                for (const anchor of shape.anchors) {
                    if (anchor.contains(pos)) {
                        return anchor;
                    }
                }
            }
            return null;
        }

        createShape(type, x, y, width, height) {
            const shape = new Shape(type, x, y, width, height);
            shape.zIndex = this.shapes.length;
            this.shapes.push(shape);
            this.selection.setShapes([shape]);
            this.updatePropertyPanel();
            this.render();
        }

        deleteSelection() {
            if (this.isEditingText) return;
            
            for (const conn of this.selection.connections) {
                conn.destroy();
                const index = this.connections.indexOf(conn);
                if (index > -1) {
                    this.connections.splice(index, 1);
                }
            }
            
            for (const shape of this.selection.shapes) {
                for (const anchor of shape.anchors) {
                    const connsToRemove = [...anchor.connections];
                    for (const conn of connsToRemove) {
                        conn.destroy();
                        const index = this.connections.indexOf(conn);
                        if (index > -1) {
                            this.connections.splice(index, 1);
                        }
                    }
                }
                
                const index = this.shapes.indexOf(shape);
                if (index > -1) {
                    this.shapes.splice(index, 1);
                }
            }
            
            this.selection.clear();
            this.updatePropertyPanel();
            this.render();
        }

        clearAll() {
            for (const conn of this.connections) {
                conn.destroy();
            }
            this.connections = [];
            this.shapes = [];
            this.selection.clear();
            this.updatePropertyPanel();
            this.render();
        }

        startTextEdit(shape) {
            this.isEditingText = true;
            this.editingShape = shape;
            
            const b = shape.bounds;
            const padding = 8;
            
            this.textEditor.value = shape.text;
            this.textEditor.style.left = (b.x + padding) + 'px';
            this.textEditor.style.top = (b.y + padding) + 'px';
            this.textEditor.style.width = (b.width - padding * 2) + 'px';
            this.textEditor.style.height = (b.height - padding * 2) + 'px';
            this.textEditor.style.fontFamily = shape.style.fontFamily;
            this.textEditor.style.fontSize = shape.style.fontSize + 'px';
            this.textEditor.style.color = shape.style.fontColor;
            this.textEditor.style.textAlign = shape.style.textAlign;
            
            let textAlign = 'left';
            if (shape.style.textAlign === 'center') {
                textAlign = 'center';
            } else if (shape.style.textAlign === 'right') {
                textAlign = 'right';
            }
            this.textEditor.style.textAlign = textAlign;
            
            this.textEditor.style.display = 'block';
            this.textEditor.focus();
            this.textEditor.select();
        }

        cancelTextEdit() {
            if (!this.isEditingText) return;
            
            this.isEditingText = false;
            this.textEditor.style.display = 'none';
            this.editingShape = null;
        }

        finishTextEdit() {
            if (!this.isEditingText || !this.editingShape) return;
            
            this.editingShape.text = this.textEditor.value;
            this.cancelTextEdit();
            this.render();
        }

        updatePropertyPanel() {
            const propFillColor = document.getElementById('prop-fill-color');
            const propStrokeColor = document.getElementById('prop-stroke-color');
            const propStrokeWidth = document.getElementById('prop-stroke-width');
            const propFontFamily = document.getElementById('prop-font-family');
            const propFontSize = document.getElementById('prop-font-size');
            const propFontColor = document.getElementById('prop-font-color');
            const propOpacity = document.getElementById('prop-opacity');
            const propX = document.getElementById('prop-x');
            const propY = document.getElementById('prop-y');
            const propWidth = document.getElementById('prop-width');
            const propHeight = document.getElementById('prop-height');
            
            const inputs = [propFillColor, propStrokeColor, propStrokeWidth, 
                          propFontFamily, propFontSize, propFontColor, propOpacity,
                          propX, propY, propWidth, propHeight];
            
            if (this.selection.hasSingleShape) {
                const shape = this.selection.singleShape;
                const style = shape.style;
                
                inputs.forEach(input => input.disabled = false);
                
                propFillColor.value = style.fillColor;
                propStrokeColor.value = style.strokeColor;
                propStrokeWidth.value = style.strokeWidth;
                propFontFamily.value = style.fontFamily;
                propFontSize.value = style.fontSize;
                propFontColor.value = style.fontColor;
                propOpacity.value = Math.round(style.opacity * 100);
                propX.value = Math.round(shape.bounds.x);
                propY.value = Math.round(shape.bounds.y);
                propWidth.value = Math.round(shape.bounds.width);
                propHeight.value = Math.round(shape.bounds.height);
                
                document.querySelectorAll('.align-btn').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.align === style.textAlign);
                });
            } else if (this.selection.hasConnections) {
                propStrokeColor.disabled = false;
                propStrokeWidth.disabled = false;
                propFillColor.disabled = true;
                propFontFamily.disabled = true;
                propFontSize.disabled = true;
                propFontColor.disabled = true;
                propOpacity.disabled = true;
                propX.disabled = true;
                propY.disabled = true;
                propWidth.disabled = true;
                propHeight.disabled = true;
            } else {
                inputs.forEach(input => input.disabled = true);
            }
        }

        renderShapePreviews() {
            const previews = document.querySelectorAll('.shape-preview');
            previews.forEach(canvas => {
                const ctx = canvas.getContext('2d');
                const shapeType = canvas.dataset.shape;
                
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#ffffff';
                ctx.strokeStyle = '#333333';
                ctx.lineWidth = 2;
                
                const w = canvas.width;
                const h = canvas.height;
                const margin = 5;
                
                ctx.beginPath();
                
                switch (shapeType) {
                    case 'rectangle':
                        ctx.rect(margin, margin, w - margin * 2, h - margin * 2);
                        break;
                    case 'rounded-rectangle':
                        const r = Math.min(8, (w - margin * 2) / 2, (h - margin * 2) / 2);
                        const rx = margin, ry = margin, rw = w - margin * 2, rh = h - margin * 2;
                        ctx.moveTo(rx + r, ry);
                        ctx.lineTo(rx + rw - r, ry);
                        ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + r);
                        ctx.lineTo(rx + rw, ry + rh - r);
                        ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - r, ry + rh);
                        ctx.lineTo(rx + r, ry + rh);
                        ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - r);
                        ctx.lineTo(rx, ry + r);
                        ctx.quadraticCurveTo(rx, ry, rx + r, ry);
                        ctx.closePath();
                        break;
                    case 'diamond':
                        ctx.moveTo(w / 2, margin);
                        ctx.lineTo(w - margin, h / 2);
                        ctx.lineTo(w / 2, h - margin);
                        ctx.lineTo(margin, h / 2);
                        ctx.closePath();
                        break;
                    case 'circle':
                        ctx.ellipse(w / 2, h / 2, (w - margin * 2) / 2, (h - margin * 2) / 2, 0, 0, Math.PI * 2);
                        break;
                    case 'parallelogram':
                        const offset = (w - margin * 2) * 0.15;
                        ctx.moveTo(margin + offset, margin);
                        ctx.lineTo(w - margin, margin);
                        ctx.lineTo(w - margin - offset, h - margin);
                        ctx.lineTo(margin, h - margin);
                        ctx.closePath();
                        break;
                    case 'trapezoid':
                        const topOffset = (w - margin * 2) * 0.2;
                        ctx.moveTo(margin + topOffset, margin);
                        ctx.lineTo(w - margin - topOffset, margin);
                        ctx.lineTo(w - margin, h - margin);
                        ctx.lineTo(margin, h - margin);
                        ctx.closePath();
                        break;
                }
                
                ctx.fill();
                ctx.stroke();
            });
        }

        render() {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
            
            this.drawGrid();
            
            const allItems = [...this.shapes, ...this.connections];
            allItems.sort((a, b) => a.zIndex - b.zIndex);
            
            for (const item of allItems) {
                if (item instanceof Shape) {
                    item.draw(this.ctx);
                }
            }
            
            for (const conn of this.connections) {
                conn.draw(this.ctx);
            }
            
            for (const shape of this.selection.shapes) {
                shape.drawSelection(this.overlayCtx);
            }
            
            const showAllAnchors = this.currentTool === ToolType.CONNECT || this.isConnecting;
            if (showAllAnchors) {
                for (const shape of this.shapes) {
                    shape.drawAnchors(this.overlayCtx, this.highlightedAnchor);
                }
            } else {
                for (const shape of this.selection.shapes) {
                    shape.drawAnchors(this.overlayCtx, this.highlightedAnchor);
                }
            }
            
            if (this.isSelecting) {
                this.drawSelectionBox();
            }
            
            if (this.isConnecting && this.connectionStart) {
                this.drawTemporaryConnection();
            }
        }

        drawGrid() {
            this.ctx.save();
            this.ctx.strokeStyle = '#2d2d30';
            this.ctx.lineWidth = 1;
            
            for (let x = 0; x <= this.canvas.width; x += GRID_SIZE) {
                this.ctx.beginPath();
                this.ctx.moveTo(x, 0);
                this.ctx.lineTo(x, this.canvas.height);
                this.ctx.stroke();
            }
            
            for (let y = 0; y <= this.canvas.height; y += GRID_SIZE) {
                this.ctx.beginPath();
                this.ctx.moveTo(0, y);
                this.ctx.lineTo(this.canvas.width, y);
                this.ctx.stroke();
            }
            
            this.ctx.restore();
        }

        drawSelectionBox() {
            const bounds = this.getSelectionBounds();
            if (!bounds) return;
            
            this.overlayCtx.save();
            this.overlayCtx.strokeStyle = '#007acc';
            this.overlayCtx.lineWidth = 1;
            this.overlayCtx.setLineDash([5, 5]);
            this.overlayCtx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
            this.overlayCtx.setLineDash([]);
            this.overlayCtx.fillStyle = 'rgba(0, 122, 204, 0.1)';
            this.overlayCtx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
            this.overlayCtx.restore();
        }

        drawTemporaryConnection() {
            const start = this.connectionStart.worldPosition;
            const end = this.connectionEnd ? this.connectionEnd.worldPosition : this.mousePos;
            
            this.overlayCtx.save();
            this.overlayCtx.strokeStyle = '#007acc';
            this.overlayCtx.lineWidth = 2;
            this.overlayCtx.setLineDash([5, 5]);
            this.overlayCtx.beginPath();
            this.overlayCtx.moveTo(start.x, start.y);
            this.overlayCtx.lineTo(end.x, end.y);
            this.overlayCtx.stroke();
            this.overlayCtx.setLineDash([]);
            this.overlayCtx.restore();
        }

        exportPNG() {
            const bounds = this.getContentBounds();
            if (!bounds) {
                alert('画布为空，无法导出');
                return;
            }
            
            const padding = 20;
            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = bounds.width + padding * 2;
            exportCanvas.height = bounds.height + padding * 2;
            const exportCtx = exportCanvas.getContext('2d');
            
            exportCtx.fillStyle = '#ffffff';
            exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
            
            exportCtx.save();
            exportCtx.translate(-bounds.x + padding, -bounds.y + padding);
            
            for (const shape of this.shapes) {
                shape.draw(exportCtx);
            }
            for (const conn of this.connections) {
                conn.draw(exportCtx);
            }
            
            exportCtx.restore();
            
            const link = document.createElement('a');
            link.download = 'flowchart.png';
            link.href = exportCanvas.toDataURL('image/png');
            link.click();
        }

        exportPDF() {
            const { jsPDF } = window.jspdf;
            if (!jsPDF) {
                alert('PDF导出库加载失败');
                return;
            }
            
            const bounds = this.getContentBounds();
            if (!bounds) {
                alert('画布为空，无法导出');
                return;
            }
            
            const padding = 20;
            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = bounds.width + padding * 2;
            exportCanvas.height = bounds.height + padding * 2;
            const exportCtx = exportCanvas.getContext('2d');
            
            exportCtx.fillStyle = '#ffffff';
            exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
            
            exportCtx.save();
            exportCtx.translate(-bounds.x + padding, -bounds.y + padding);
            
            for (const shape of this.shapes) {
                shape.draw(exportCtx);
            }
            for (const conn of this.connections) {
                conn.draw(exportCtx);
            }
            
            exportCtx.restore();
            
            const imgData = exportCanvas.toDataURL('image/png');
            const pdf = new jsPDF({
                orientation: exportCanvas.width > exportCanvas.height ? 'landscape' : 'portrait',
                unit: 'px',
                format: [exportCanvas.width, exportCanvas.height]
            });
            
            pdf.addImage(imgData, 'PNG', 0, 0, exportCanvas.width, exportCanvas.height);
            pdf.save('flowchart.pdf');
        }

        exportSVG() {
            const bounds = this.getContentBounds();
            if (!bounds) {
                alert('画布为空，无法导出');
                return;
            }
            
            const padding = 20;
            const width = bounds.width + padding * 2;
            const height = bounds.height + padding * 2;
            const offsetX = -bounds.x + padding;
            const offsetY = -bounds.y + padding;
            
            let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>
`;
            
            for (const shape of this.shapes) {
                svg += this.shapeToSVG(shape, offsetX, offsetY);
            }
            
            for (const conn of this.connections) {
                svg += this.connectionToSVG(conn, offsetX, offsetY);
            }
            
            svg += '</svg>';
            
            const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = 'flowchart.svg';
            link.href = url;
            link.click();
            URL.revokeObjectURL(url);
        }

        getContentBounds() {
            if (this.shapes.length === 0 && this.connections.length === 0) {
                return null;
            }
            
            let minX = Infinity, minY = Infinity;
            let maxX = -Infinity, maxY = -Infinity;
            
            for (const shape of this.shapes) {
                minX = Math.min(minX, shape.bounds.left);
                minY = Math.min(minY, shape.bounds.top);
                maxX = Math.max(maxX, shape.bounds.right);
                maxY = Math.max(maxY, shape.bounds.bottom);
            }
            
            for (const conn of this.connections) {
                for (const p of conn.points) {
                    minX = Math.min(minX, p.x);
                    minY = Math.min(minY, p.y);
                    maxX = Math.max(maxX, p.x);
                    maxY = Math.max(maxY, p.y);
                }
            }
            
            return new Bounds(minX, minY, maxX - minX, maxY - minY);
        }

        shapeToSVG(shape, offsetX, offsetY) {
            const b = shape.bounds;
            const x = b.x + offsetX;
            const y = b.y + offsetY;
            const w = b.width;
            const h = b.height;
            
            let path = '';
            
            switch (shape.type) {
                case ShapeType.RECTANGLE:
                    path = `<rect x="${x}" y="${y}" width="${w}" height="${h}"`;
                    break;
                case ShapeType.ROUNDED_RECTANGLE:
                    const r = Math.min(10, w/2, h/2);
                    path = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"`;
                    break;
                case ShapeType.DIAMOND:
                    path = `<path d="M ${x + w/2} ${y} L ${x + w} ${y + h/2} L ${x + w/2} ${y + h} L ${x} ${y + h/2} Z"`;
                    break;
                case ShapeType.CIRCLE:
                    path = `<ellipse cx="${x + w/2}" cy="${y + h/2}" rx="${w/2}" ry="${h/2}"`;
                    break;
                case ShapeType.PARALLELOGRAM:
                    const offset = w * 0.15;
                    path = `<path d="M ${x + offset} ${y} L ${x + w} ${y} L ${x + w - offset} ${y + h} L ${x} ${y + h} Z"`;
                    break;
                case ShapeType.TRAPEZOID:
                    const topOffset = w * 0.2;
                    path = `<path d="M ${x + topOffset} ${y} L ${x + w - topOffset} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z"`;
                    break;
            }
            
            let result = '';
            if (shape.type === ShapeType.RECTANGLE || shape.type === ShapeType.ROUNDED_RECTANGLE || 
                shape.type === ShapeType.CIRCLE) {
                result = `${path} fill="${shape.style.fillColor}" stroke="${shape.style.strokeColor}" stroke-width="${shape.style.strokeWidth}" opacity="${shape.style.opacity}"/>`;
            } else {
                result = `${path} fill="${shape.style.fillColor}" stroke="${shape.style.strokeColor}" stroke-width="${shape.style.strokeWidth}" opacity="${shape.style.opacity}"/>`;
            }
            
            if (shape.text) {
                const lines = shape.text.split('\n');
                const lineHeight = shape.style.fontSize * 1.4;
                const totalHeight = lines.length * lineHeight;
                let startY = y + h/2 - totalHeight/2 + shape.style.fontSize;
                
                for (let i = 0; i < lines.length; i++) {
                    let textX = x + w/2;
                    let anchor = 'middle';
                    
                    if (shape.style.textAlign === 'left') {
                        textX = x + 8;
                        anchor = 'start';
                    } else if (shape.style.textAlign === 'right') {
                        textX = x + w - 8;
                        anchor = 'end';
                    }
                    
                    result += `<text x="${textX}" y="${startY}" font-family="${shape.style.fontFamily}" font-size="${shape.style.fontSize}" fill="${shape.style.fontColor}" text-anchor="${anchor}">${this.escapeXML(lines[i])}</text>`;
                    startY += lineHeight;
                }
            }
            
            return result + '\n';
        }

        connectionToSVG(conn, offsetX, offsetY) {
            let result = '';
            
            if (conn.lineType === LineType.STRAIGHT || conn.lineType === LineType.POLYLINE) {
                let d = `M ${conn.points[0].x + offsetX} ${conn.points[0].y + offsetY}`;
                for (let i = 1; i < conn.points.length; i++) {
                    d += ` L ${conn.points[i].x + offsetX} ${conn.points[i].y + offsetY}`;
                }
                result = `<path d="${d}" fill="none" stroke="${conn.style.strokeColor}" stroke-width="${conn.style.strokeWidth}"/>`;
            } else if (conn.lineType === LineType.CURVE && conn.points.length === 4) {
                result = `<path d="M ${conn.points[0].x + offsetX} ${conn.points[0].y + offsetY} C ${conn.points[1].x + offsetX} ${conn.points[1].y + offsetY}, ${conn.points[2].x + offsetX} ${conn.points[2].y + offsetY}, ${conn.points[3].x + offsetX} ${conn.points[3].y + offsetY}" fill="none" stroke="${conn.style.strokeColor}" stroke-width="${conn.style.strokeWidth}"/>`;
            }
            
            return result + '\n';
        }

        escapeXML(text) {
            return text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');
        }
    }

    document.addEventListener('DOMContentLoaded', function() {
        const app = new FlowChartApp();
        
        const textEditor = document.getElementById('text-editor');
        textEditor.addEventListener('blur', () => {
            app.finishTextEdit();
        });
        
        textEditor.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                app.cancelTextEdit();
            } else if (e.key === 'Enter' && !e.shiftKey) {
                app.finishTextEdit();
                e.preventDefault();
            }
        });
        
        window.flowChartApp = app;
    });

})();
