"use strict";(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[5275],{2014:(e,t,i)=>{i.d(t,{G:()=>r});var n=i(50773),a=i(15742);n.fCn.line={worldUnits:{value:1},linewidth:{value:1},resolution:{value:new a.I9Y(1,1)},dashOffset:{value:0},dashScale:{value:1},dashSize:{value:1},gapSize:{value:1}},n.zkh.line={uniforms:a.LlO.merge([n.fCn.common,n.fCn.fog,n.fCn.line]),vertexShader:`
		#include <common>
		#include <color_pars_vertex>
		#include <fog_pars_vertex>
		#include <logdepthbuf_pars_vertex>
		#include <clipping_planes_pars_vertex>

		uniform float linewidth;
		uniform vec2 resolution;

		attribute vec3 instanceStart;
		attribute vec3 instanceEnd;

		attribute vec3 instanceColorStart;
		attribute vec3 instanceColorEnd;

		#ifdef WORLD_UNITS

			varying vec4 worldPos;
			varying vec3 worldStart;
			varying vec3 worldEnd;

			#ifdef USE_DASH

				varying vec2 vUv;

			#endif

		#else

			varying vec2 vUv;

		#endif

		#ifdef USE_DASH

			uniform float dashScale;
			attribute float instanceDistanceStart;
			attribute float instanceDistanceEnd;
			varying float vLineDistance;

		#endif

		void trimSegment( const in vec4 start, inout vec4 end ) {

			// trim end segment so it terminates between the camera plane and the near plane

			// conservative estimate of the near plane
			float a = projectionMatrix[ 2 ][ 2 ]; // 3nd entry in 3th column
			float b = projectionMatrix[ 3 ][ 2 ]; // 3nd entry in 4th column
			float nearEstimate = - 0.5 * b / a;

			float alpha = ( nearEstimate - start.z ) / ( end.z - start.z );

			end.xyz = mix( start.xyz, end.xyz, alpha );

		}

		void main() {

			#ifdef USE_COLOR

				vColor.xyz = ( position.y < 0.5 ) ? instanceColorStart : instanceColorEnd;

			#endif

			#ifdef USE_DASH

				vLineDistance = ( position.y < 0.5 ) ? dashScale * instanceDistanceStart : dashScale * instanceDistanceEnd;
				vUv = uv;

			#endif

			float aspect = resolution.x / resolution.y;

			// camera space
			vec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );
			vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );

			#ifdef WORLD_UNITS

				worldStart = start.xyz;
				worldEnd = end.xyz;

			#else

				vUv = uv;

			#endif

			// special case for perspective projection, and segments that terminate either in, or behind, the camera plane
			// clearly the gpu firmware has a way of addressing this issue when projecting into ndc space
			// but we need to perform ndc-space calculations in the shader, so we must address this issue directly
			// perhaps there is a more elegant solution -- WestLangley

			bool perspective = ( projectionMatrix[ 2 ][ 3 ] == - 1.0 ); // 4th entry in the 3rd column

			if ( perspective ) {

				if ( start.z < 0.0 && end.z >= 0.0 ) {

					trimSegment( start, end );

				} else if ( end.z < 0.0 && start.z >= 0.0 ) {

					trimSegment( end, start );

				}

			}

			// clip space
			vec4 clipStart = projectionMatrix * start;
			vec4 clipEnd = projectionMatrix * end;

			// ndc space
			vec3 ndcStart = clipStart.xyz / clipStart.w;
			vec3 ndcEnd = clipEnd.xyz / clipEnd.w;

			// direction
			vec2 dir = ndcEnd.xy - ndcStart.xy;

			// account for clip-space aspect ratio
			dir.x *= aspect;
			dir = normalize( dir );

			#ifdef WORLD_UNITS

				vec3 worldDir = normalize( end.xyz - start.xyz );
				vec3 tmpFwd = normalize( mix( start.xyz, end.xyz, 0.5 ) );
				vec3 worldUp = normalize( cross( worldDir, tmpFwd ) );
				vec3 worldFwd = cross( worldDir, worldUp );
				worldPos = position.y < 0.5 ? start: end;

				// height offset
				float hw = linewidth * 0.5;
				worldPos.xyz += position.x < 0.0 ? hw * worldUp : - hw * worldUp;

				// don't extend the line if we're rendering dashes because we
				// won't be rendering the endcaps
				#ifndef USE_DASH

					// cap extension
					worldPos.xyz += position.y < 0.5 ? - hw * worldDir : hw * worldDir;

					// add width to the box
					worldPos.xyz += worldFwd * hw;

					// endcaps
					if ( position.y > 1.0 || position.y < 0.0 ) {

						worldPos.xyz -= worldFwd * 2.0 * hw;

					}

				#endif

				// project the worldpos
				vec4 clip = projectionMatrix * worldPos;

				// shift the depth of the projected points so the line
				// segments overlap neatly
				vec3 clipPose = ( position.y < 0.5 ) ? ndcStart : ndcEnd;
				clip.z = clipPose.z * clip.w;

			#else

				vec2 offset = vec2( dir.y, - dir.x );
				// undo aspect ratio adjustment
				dir.x /= aspect;
				offset.x /= aspect;

				// sign flip
				if ( position.x < 0.0 ) offset *= - 1.0;

				// endcaps
				if ( position.y < 0.0 ) {

					offset += - dir;

				} else if ( position.y > 1.0 ) {

					offset += dir;

				}

				// adjust for linewidth
				offset *= linewidth;

				// adjust for clip-space to screen-space conversion // maybe resolution should be based on viewport ...
				offset /= resolution.y;

				// select end
				vec4 clip = ( position.y < 0.5 ) ? clipStart : clipEnd;

				// back to clip space
				offset *= clip.w;

				clip.xy += offset;

			#endif

			gl_Position = clip;

			vec4 mvPosition = ( position.y < 0.5 ) ? start : end; // this is an approximation

			#include <logdepthbuf_vertex>
			#include <clipping_planes_vertex>
			#include <fog_vertex>

		}
		`,fragmentShader:`
		uniform vec3 diffuse;
		uniform float opacity;
		uniform float linewidth;

		#ifdef USE_DASH

			uniform float dashOffset;
			uniform float dashSize;
			uniform float gapSize;

		#endif

		varying float vLineDistance;

		#ifdef WORLD_UNITS

			varying vec4 worldPos;
			varying vec3 worldStart;
			varying vec3 worldEnd;

			#ifdef USE_DASH

				varying vec2 vUv;

			#endif

		#else

			varying vec2 vUv;

		#endif

		#include <common>
		#include <color_pars_fragment>
		#include <fog_pars_fragment>
		#include <logdepthbuf_pars_fragment>
		#include <clipping_planes_pars_fragment>

		vec2 closestLineToLine(vec3 p1, vec3 p2, vec3 p3, vec3 p4) {

			float mua;
			float mub;

			vec3 p13 = p1 - p3;
			vec3 p43 = p4 - p3;

			vec3 p21 = p2 - p1;

			float d1343 = dot( p13, p43 );
			float d4321 = dot( p43, p21 );
			float d1321 = dot( p13, p21 );
			float d4343 = dot( p43, p43 );
			float d2121 = dot( p21, p21 );

			float denom = d2121 * d4343 - d4321 * d4321;

			float numer = d1343 * d4321 - d1321 * d4343;

			mua = numer / denom;
			mua = clamp( mua, 0.0, 1.0 );
			mub = ( d1343 + d4321 * ( mua ) ) / d4343;
			mub = clamp( mub, 0.0, 1.0 );

			return vec2( mua, mub );

		}

		void main() {

			float alpha = opacity;
			vec4 diffuseColor = vec4( diffuse, alpha );

			#include <clipping_planes_fragment>

			#ifdef USE_DASH

				if ( vUv.y < - 1.0 || vUv.y > 1.0 ) discard; // discard endcaps

				if ( mod( vLineDistance + dashOffset, dashSize + gapSize ) > dashSize ) discard; // todo - FIX

			#endif

			#ifdef WORLD_UNITS

				// Find the closest points on the view ray and the line segment
				vec3 rayEnd = normalize( worldPos.xyz ) * 1e5;
				vec3 lineDir = worldEnd - worldStart;
				vec2 params = closestLineToLine( worldStart, worldEnd, vec3( 0.0, 0.0, 0.0 ), rayEnd );

				vec3 p1 = worldStart + lineDir * params.x;
				vec3 p2 = rayEnd * params.y;
				vec3 delta = p1 - p2;
				float len = length( delta );
				float norm = len / linewidth;

				#ifndef USE_DASH

					#ifdef USE_ALPHA_TO_COVERAGE

						float dnorm = fwidth( norm );
						alpha = 1.0 - smoothstep( 0.5 - dnorm, 0.5 + dnorm, norm );

					#else

						if ( norm > 0.5 ) {

							discard;

						}

					#endif

				#endif

			#else

				#ifdef USE_ALPHA_TO_COVERAGE

					// artifacts appear on some hardware if a derivative is taken within a conditional
					float a = vUv.x;
					float b = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
					float len2 = a * a + b * b;
					float dlen = fwidth( len2 );

					if ( abs( vUv.y ) > 1.0 ) {

						alpha = 1.0 - smoothstep( 1.0 - dlen, 1.0 + dlen, len2 );

					}

				#else

					if ( abs( vUv.y ) > 1.0 ) {

						float a = vUv.x;
						float b = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
						float len2 = a * a + b * b;

						if ( len2 > 1.0 ) discard;

					}

				#endif

			#endif

			#include <logdepthbuf_fragment>
			#include <color_fragment>

			gl_FragColor = vec4( diffuseColor.rgb, alpha );

			#include <tonemapping_fragment>
			#include <colorspace_fragment>
			#include <fog_fragment>
			#include <premultiplied_alpha_fragment>

		}
		`};class r extends a.BKk{constructor(e){super({type:"LineMaterial",uniforms:a.LlO.clone(n.zkh.line.uniforms),vertexShader:n.zkh.line.vertexShader,fragmentShader:n.zkh.line.fragmentShader,clipping:!0}),this.isLineMaterial=!0,this.setValues(e)}get color(){return this.uniforms.diffuse.value}set color(e){this.uniforms.diffuse.value=e}get worldUnits(){return"WORLD_UNITS"in this.defines}set worldUnits(e){!0===e!==this.worldUnits&&(this.needsUpdate=!0),!0===e?this.defines.WORLD_UNITS="":delete this.defines.WORLD_UNITS}get linewidth(){return this.uniforms.linewidth.value}set linewidth(e){this.uniforms.linewidth&&(this.uniforms.linewidth.value=e)}get dashed(){return"USE_DASH"in this.defines}set dashed(e){!0===e!==this.dashed&&(this.needsUpdate=!0),!0===e?this.defines.USE_DASH="":delete this.defines.USE_DASH}get dashScale(){return this.uniforms.dashScale.value}set dashScale(e){this.uniforms.dashScale.value=e}get dashSize(){return this.uniforms.dashSize.value}set dashSize(e){this.uniforms.dashSize.value=e}get dashOffset(){return this.uniforms.dashOffset.value}set dashOffset(e){this.uniforms.dashOffset.value=e}get gapSize(){return this.uniforms.gapSize.value}set gapSize(e){this.uniforms.gapSize.value=e}get opacity(){return this.uniforms.opacity.value}set opacity(e){this.uniforms&&(this.uniforms.opacity.value=e)}get resolution(){return this.uniforms.resolution.value}set resolution(e){this.uniforms.resolution.value.copy(e)}get alphaToCoverage(){return"USE_ALPHA_TO_COVERAGE"in this.defines}set alphaToCoverage(e){this.defines&&(!0===e!==this.alphaToCoverage&&(this.needsUpdate=!0),!0===e?this.defines.USE_ALPHA_TO_COVERAGE="":delete this.defines.USE_ALPHA_TO_COVERAGE)}}},4650:(e,t,i)=>{i.d(t,{A:()=>n});let n=(0,i(92068).A)("crosshair",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["line",{x1:"22",x2:"18",y1:"12",y2:"12",key:"l9bcsi"}],["line",{x1:"6",x2:"2",y1:"12",y2:"12",key:"13hhkx"}],["line",{x1:"12",x2:"12",y1:"6",y2:"2",key:"10w3f3"}],["line",{x1:"12",x2:"12",y1:"22",y2:"18",key:"15g9kq"}]])},7547:(e,t,i)=>{i.d(t,{LO:()=>c,je:()=>u,zQ:()=>l});var n=i(15742),a=i(91391);parseInt(n.sPf);let r={Mesh:n.eaF.prototype.raycast,Line:n.N1A.prototype.raycast,LineSegments:n.DXC.prototype.raycast,LineLoop:n.FCc.prototype.raycast,Points:n.ONl.prototype.raycast,BatchedMesh:n.$Ed.prototype.raycast},s=new n.eaF,o=[];function l(e,t){if(this.isBatchedMesh)d.call(this,e,t);else{let{geometry:i}=this;if(i.boundsTree)i.boundsTree.raycastObject3D(this,e,t);else{let i;if(this instanceof n.eaF)i=r.Mesh;else if(this instanceof n.DXC)i=r.LineSegments;else if(this instanceof n.FCc)i=r.LineLoop;else if(this instanceof n.N1A)i=r.Line;else if(this instanceof n.ONl)i=r.Points;else throw Error("BVH: Fallback raycast function not found.");i.call(this,e,t)}}}function d(e,t){if(this.boundsTrees){let i=this.boundsTrees,a=this._drawInfo||this._instanceInfo,r=this._drawRanges||this._geometryInfo,l=this.matrixWorld;s.material=this.material,s.geometry=this.geometry;let d=s.geometry.boundsTree,c=s.geometry.drawRange;null===s.geometry.boundingSphere&&(s.geometry.boundingSphere=new n.iyt);for(let n=0,d=a.length;n<d;n++){if(!this.getVisibleAt(n))continue;let d=a[n].geometryIndex;if(s.geometry.boundsTree=i[d],this.getMatrixAt(n,s.matrixWorld).premultiply(l),!s.geometry.boundsTree){this.getBoundingBoxAt(d,s.geometry.boundingBox),this.getBoundingSphereAt(d,s.geometry.boundingSphere);let e=r[d];s.geometry.setDrawRange(e.start,e.count)}s.raycast(e,o);for(let e=0,i=o.length;e<i;e++){let i=o[e];i.object=this,i.batchId=n,t.push(i)}o.length=0}s.geometry.boundsTree=d,s.geometry.drawRange=c,s.material=null,s.geometry=null}else r.BatchedMesh.call(this,e,t)}function c(e={}){let{type:t=a.G}=e;return this.boundsTree=new t(this,e),this.boundsTree}function u(){this.boundsTree=null}},38391:(e,t,i)=>{i.d(t,{A:()=>n});let n=(0,i(92068).A)("eye",[["path",{d:"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",key:"1nclc0"}],["circle",{cx:"12",cy:"12",r:"3",key:"1v7zrd"}]])},43030:(e,t,i)=>{i.d(t,{A:()=>n});let n=(0,i(92068).A)("mouse-pointer-2",[["path",{d:"M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z",key:"edeuup"}]])},44533:(e,t,i)=>{i.d(t,{n:()=>s});var n=i(15742);let a=new n.NRn,r=new n.Pq0;class s extends n.CmU{constructor(){super(),this.isLineSegmentsGeometry=!0,this.type="LineSegmentsGeometry",this.setIndex([0,2,1,2,3,1,2,4,3,4,5,3,4,6,5,6,7,5]),this.setAttribute("position",new n.qtW([-1,2,0,1,2,0,-1,1,0,1,1,0,-1,0,0,1,0,0,-1,-1,0,1,-1,0],3)),this.setAttribute("uv",new n.qtW([-1,2,1,2,-1,1,1,1,-1,-1,1,-1,-1,-2,1,-2],2))}applyMatrix4(e){let t=this.attributes.instanceStart,i=this.attributes.instanceEnd;return void 0!==t&&(t.applyMatrix4(e),i.applyMatrix4(e),t.needsUpdate=!0),null!==this.boundingBox&&this.computeBoundingBox(),null!==this.boundingSphere&&this.computeBoundingSphere(),this}setPositions(e){let t;e instanceof Float32Array?t=e:Array.isArray(e)&&(t=new Float32Array(e));let i=new n.LuO(t,6,1);return this.setAttribute("instanceStart",new n.eHs(i,3,0)),this.setAttribute("instanceEnd",new n.eHs(i,3,3)),this.instanceCount=this.attributes.instanceStart.count,this.computeBoundingBox(),this.computeBoundingSphere(),this}setColors(e){let t;e instanceof Float32Array?t=e:Array.isArray(e)&&(t=new Float32Array(e));let i=new n.LuO(t,6,1);return this.setAttribute("instanceColorStart",new n.eHs(i,3,0)),this.setAttribute("instanceColorEnd",new n.eHs(i,3,3)),this}fromWireframeGeometry(e){return this.setPositions(e.attributes.position.array),this}fromEdgesGeometry(e){return this.setPositions(e.attributes.position.array),this}fromMesh(e){return this.fromWireframeGeometry(new n.XJ7(e.geometry)),this}fromLineSegments(e){let t=e.geometry;return this.setPositions(t.attributes.position.array),this}computeBoundingBox(){null===this.boundingBox&&(this.boundingBox=new n.NRn);let e=this.attributes.instanceStart,t=this.attributes.instanceEnd;void 0!==e&&void 0!==t&&(this.boundingBox.setFromBufferAttribute(e),a.setFromBufferAttribute(t),this.boundingBox.union(a))}computeBoundingSphere(){null===this.boundingSphere&&(this.boundingSphere=new n.iyt),null===this.boundingBox&&this.computeBoundingBox();let e=this.attributes.instanceStart,t=this.attributes.instanceEnd;if(void 0!==e&&void 0!==t){let i=this.boundingSphere.center;this.boundingBox.getCenter(i);let n=0;for(let a=0,s=e.count;a<s;a++)r.fromBufferAttribute(e,a),n=Math.max(n,i.distanceToSquared(r)),r.fromBufferAttribute(t,a),n=Math.max(n,i.distanceToSquared(r));this.boundingSphere.radius=Math.sqrt(n),isNaN(this.boundingSphere.radius)&&console.error("THREE.LineSegmentsGeometry.computeBoundingSphere(): Computed radius is NaN. The instanced position data is likely to have NaN values.",this)}}toJSON(){}}},53135:(e,t,i)=>{i.d(t,{A:()=>n});let n=(0,i(92068).A)("eye-off",[["path",{d:"M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49",key:"ct8e1f"}],["path",{d:"M14.084 14.158a3 3 0 0 1-4.242-4.242",key:"151rxh"}],["path",{d:"M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143",key:"13bj9a"}],["path",{d:"m2 2 20 20",key:"1ooewy"}]])},69941:(e,t,i)=>{let n,a;i.d(t,{b:()=>b});var r=i(15742),s=i(44533),o=i(2014);let l=new r.IUQ,d=new r.Pq0,c=new r.Pq0,u=new r.IUQ,f=new r.IUQ,p=new r.IUQ,h=new r.Pq0,m=new r.kn4,y=new r.cZY,v=new r.Pq0,g=new r.NRn,w=new r.iyt,S=new r.IUQ;function x(e,t,i){return S.set(0,0,-t,1).applyMatrix4(e.projectionMatrix),S.multiplyScalar(1/S.w),S.x=a/i.width,S.y=a/i.height,S.applyMatrix4(e.projectionMatrixInverse),S.multiplyScalar(1/S.w),Math.abs(Math.max(S.x,S.y))}class b extends r.eaF{constructor(e=new s.n,t=new o.G({color:0xffffff*Math.random()})){super(e,t),this.isLineSegments2=!0,this.type="LineSegments2"}computeLineDistances(){let e=this.geometry,t=e.attributes.instanceStart,i=e.attributes.instanceEnd,n=new Float32Array(2*t.count);for(let e=0,a=0,r=t.count;e<r;e++,a+=2)d.fromBufferAttribute(t,e),c.fromBufferAttribute(i,e),n[a]=0===a?0:n[a-1],n[a+1]=n[a]+d.distanceTo(c);let a=new r.LuO(n,2,1);return e.setAttribute("instanceDistanceStart",new r.eHs(a,1,0)),e.setAttribute("instanceDistanceEnd",new r.eHs(a,1,1)),this}raycast(e,t){let i,s,o=this.material.worldUnits,l=e.camera;null!==l||o||console.error('LineSegments2: "Raycaster.camera" needs to be set in order to raycast against LineSegments2 while worldUnits is set to false.');let d=void 0!==e.params.Line2&&e.params.Line2.threshold||0;n=e.ray;let c=this.matrixWorld,S=this.geometry,b=this.material;if(a=b.linewidth+d,null===S.boundingSphere&&S.computeBoundingSphere(),w.copy(S.boundingSphere).applyMatrix4(c),o)i=.5*a;else{let e=Math.max(l.near,w.distanceToPoint(n.origin));i=x(l,e,b.resolution)}if(w.radius+=i,!1!==n.intersectsSphere(w)){if(null===S.boundingBox&&S.computeBoundingBox(),g.copy(S.boundingBox).applyMatrix4(c),o)s=.5*a;else{let e=Math.max(l.near,g.distanceToPoint(n.origin));s=x(l,e,b.resolution)}g.expandByScalar(s),!1!==n.intersectsBox(g)&&(o?function(e,t){let i=e.matrixWorld,s=e.geometry,o=s.attributes.instanceStart,l=s.attributes.instanceEnd,d=Math.min(s.instanceCount,o.count);for(let s=0;s<d;s++){y.start.fromBufferAttribute(o,s),y.end.fromBufferAttribute(l,s),y.applyMatrix4(i);let d=new r.Pq0,c=new r.Pq0;n.distanceSqToSegment(y.start,y.end,c,d),c.distanceTo(d)<.5*a&&t.push({point:c,pointOnLine:d,distance:n.origin.distanceTo(c),object:e,face:null,faceIndex:s,uv:null,uv1:null})}}(this,t):function(e,t,i){let s=t.projectionMatrix,o=e.material.resolution,l=e.matrixWorld,d=e.geometry,c=d.attributes.instanceStart,g=d.attributes.instanceEnd,w=Math.min(d.instanceCount,c.count),S=-t.near;n.at(1,p),p.w=1,p.applyMatrix4(t.matrixWorldInverse),p.applyMatrix4(s),p.multiplyScalar(1/p.w),p.x*=o.x/2,p.y*=o.y/2,p.z=0,h.copy(p),m.multiplyMatrices(t.matrixWorldInverse,l);for(let t=0;t<w;t++){if(u.fromBufferAttribute(c,t),f.fromBufferAttribute(g,t),u.w=1,f.w=1,u.applyMatrix4(m),f.applyMatrix4(m),u.z>S&&f.z>S)continue;if(u.z>S){let e=u.z-f.z,t=(u.z-S)/e;u.lerp(f,t)}else if(f.z>S){let e=f.z-u.z,t=(f.z-S)/e;f.lerp(u,t)}u.applyMatrix4(s),f.applyMatrix4(s),u.multiplyScalar(1/u.w),f.multiplyScalar(1/f.w),u.x*=o.x/2,u.y*=o.y/2,f.x*=o.x/2,f.y*=o.y/2,y.start.copy(u),y.start.z=0,y.end.copy(f),y.end.z=0;let d=y.closestPointToPointParameter(h,!0);y.at(d,v);let p=r.cj9.lerp(u.z,f.z,d),w=p>=-1&&p<=1,x=h.distanceTo(v)<.5*a;if(w&&x){y.start.fromBufferAttribute(c,t),y.end.fromBufferAttribute(g,t),y.start.applyMatrix4(l),y.end.applyMatrix4(l);let a=new r.Pq0,s=new r.Pq0;n.distanceSqToSegment(y.start,y.end,s,a),i.push({point:s,pointOnLine:a,distance:n.origin.distanceTo(s),object:e,face:null,faceIndex:t,uv:null,uv1:null})}}}(this,l,t))}}onBeforeRender(e){let t=this.material.uniforms;t&&t.resolution&&(e.getViewport(l),this.material.uniforms.resolution.value.set(l.z,l.w))}}},78747:(e,t,i)=>{i.d(t,{A:()=>n});let n=(0,i(92068).A)("rows-3",[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["path",{d:"M21 9H3",key:"1338ky"}],["path",{d:"M21 15H3",key:"9uk58r"}]])}}]);