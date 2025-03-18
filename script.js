const dpr = window.devicePixelRatio
const canvas = document.createElement("canvas")

// Changed to append canvas to the container instead of clearing body
const container = document.querySelector('.container')
// Don't clear the entire body content
container.appendChild(canvas)
// Don't set body style here since we're handling it in CSS

canvas.style.width = "100%"
canvas.style.height = "100%"
canvas.style.objectFit = "contain"

const vertexSource = `#version 300 es
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

in vec4 position;

void main(void) {
    gl_Position = position;
}
`
const fragmentSource = `#version 300 es
/*********
 * made by Matthias Hurrle (@atzedent) 
 */
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

out vec4 fragColor;

uniform vec2 resolution;
uniform float time;

#define T mod(2.*time, 180.)
#define S smoothstep

float rnd(float a) {
	return fract(sin(a*12.233)*78.599);
}

float rnd(vec2 p) {
	return fract(sin(dot(p,p.yx+vec2(234,543)))*345678.);
}

float curve(float a, float b) {
	a /= b;

	return mix(
		rnd(floor(a)),
		rnd(floor(a)+1.),
		pow(S(.0,1.,fract(a)),10.)
	);
}

mat2 rot(float a) {
	float s=sin(a), c=cos(a);
	return mat2(c,-s,s,c);
}

float map(vec3 p) {
  if (p.y > .28 || p.z > 15.) return 5e5;
  
	float d=p.y+(1.-cos(sin(T+6.3*p.x)))*.1;
	d += 1.-pow(cos(.75*sin(T+curve(T*.5,8.)+2.*(1.+curve(T*2.5,14.4))*(p.xz*rot(.125)).x)),2.);
	d += 1.-cos(curve(T*.2,8.)+sin(T+.8*(p.xz*rot(.38)).x))*.1;
	d += 1.2*sin(p.z*.4+sin(p.x*.6+1.2));
	
	d = max(d, -p.z);
	
	return d*.5;
}

vec3 norm(vec3 p) {
	float h=1e-3;
	vec2 k=vec2(-1,1);
	return normalize(
		k.xyy*map(p+k.xyy*h)+
		k.yxy*map(p+k.yxy*h)+
		k.yyx*map(p+k.yyx*h)+
		k.xxx*map(p+k.xxx*h)
	);
}

void cam(inout vec3 p) {
	p.xz*=rot(sin(T*.2)*.2);
}

void main(void) {
	vec2 uv = (
		gl_FragCoord.xy-.5*resolution
	)/min(resolution.x, resolution.y);

	vec3 col = vec3(0),
	p = vec3(0,0,-3),
	rd = normalize(vec3(uv,1));

	cam(p);
	cam(rd);

	const float steps=400., maxd=15.;
	float dd=.0, diffuse=mix(.75,1.,rnd(p.xz));

	for (float i=.0; i<steps; i++) {
		float d=map(p)*diffuse;

		if (d<1e-3) break;
		if (d>maxd) {
			dd=maxd;
			break;
		}

		p += rd*d;
		dd += d;
	}

	vec3 n=norm(p),
	l = normalize(vec3(0,10,-.1));

	float
	dif=max(.0,dot(n,l)),
	fre=1.+max(.0,dot(-rd,n));

	col += vec3(.3,.2,.1);
	col += .2*pow(fre,3.2)*dif;

	col *= mix(col, vec3(0), 1.-exp(-125e-5*dd*dd*dd));
	
    fragColor = vec4(col,1);
}
`
function compile(shader, source) {
    gl.shaderSource(shader, source)
    gl.compileShader(shader);

    if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader))
    }
}

let gl, programs = [], vertices, buffer;

function setup() {
    gl = canvas.getContext("webgl2")
    const vs = gl.createShader(gl.VERTEX_SHADER)
    
    compile(vs, vertexSource)

    shaders = [fragmentSource]
    programs = shaders.map(() => gl.createProgram())
    
    for (let i = 0; i < shaders.length; i++) {
        let addr = gl.createShader(gl.FRAGMENT_SHADER)
        let program = programs[i]
        
        compile(addr, shaders[i])
        gl.attachShader(program, vs)
        gl.attachShader(program, addr)
        gl.linkProgram(program)
        
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error(gl.getProgramInfoLog(program))
        }
    }

    vertices = [
        -1.,-1., 1.,
        -1.,-1., 1.,
        -1., 1., 1.,
        -1., 1., 1.,
    ]

    buffer = gl.createBuffer()

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW)

    for (let program of programs) {
        const position = gl.getAttribLocation(program, "position")

        gl.enableVertexAttribArray(position)
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

        // uniforms come here...
        program.resolution = gl.getUniformLocation(program, "resolution")
        program.time = gl.getUniformLocation(program, "time")
    }
}

function dispose() {
    if (gl) {
        const ext = gl.getExtension("WEBGL_lose_context")
        if (ext) ext.loseContext()
        gl = null
    }
}

function draw(now, program) {
    // Get background color from CSS variables
    const rootStyle = getComputedStyle(document.documentElement);
    const bgColor = rootStyle.getPropertyValue('--bg-color').trim();
    
    // Parse the hex color to RGB (default to black if parsing fails)
    let r = 0, g = 0, b = 0;
    
    if (bgColor.startsWith('#')) {
        const hex = bgColor.substring(1);
        if (hex.length === 3) {
            r = parseInt(hex[0] + hex[0], 16) / 255;
            g = parseInt(hex[1] + hex[1], 16) / 255;
            b = parseInt(hex[2] + hex[2], 16) / 255;
        } else if (hex.length === 6) {
            r = parseInt(hex.substring(0, 2), 16) / 255;
            g = parseInt(hex.substring(2, 4), 16) / 255;
            b = parseInt(hex.substring(4, 6), 16) / 255;
        }
    }
    
    gl.clearColor(r, g, b, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    // uniforms come here...
    gl.uniform2f(program.resolution, canvas.width, canvas.height);
    gl.uniform1f(program.time, now*1e-3);

    gl.drawArrays(gl.TRIANGLES, 0, vertices.length * .5);
}

function loop(now) {
    draw(now, programs[0])
    requestAnimationFrame(loop)
}

function init() {
    dispose()
    setup()
    resize()
    loop(0)
}

function resize() {
    const {
        innerWidth: width,
        innerHeight: height
    } = window

    // Using higher precision DPR calculation with a cap for performance
    const effectiveDpr = Math.min(dpr, 2); // Cap at 2x for performance on high-DPR devices
    
    canvas.width = width * effectiveDpr
    canvas.height = height * effectiveDpr

    gl.viewport(0, 0, width * effectiveDpr, height * effectiveDpr)
}

// Initialize after DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
  init()
  
  // Use a debounce function for resize to improve performance
  let resizeTimeout;
  window.onresize = function() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(resize, 200);
  }
  
  // Improved touch detection for mobile devices
  const isTouchDevice = ('ontouchstart' in window) || 
                        (navigator.maxTouchPoints > 0) || 
                        (navigator.msMaxTouchPoints > 0);
  
  if (isTouchDevice) {
    document.body.classList.add('touch-device');
    
    // Adjust overlay heights for mobile browsers with dynamic toolbars
    function adjustOverlayHeight() {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
      
      const activeOverlay = document.querySelector('.content-overlay.active');
      if (activeOverlay) {
        activeOverlay.style.height = `calc(var(--vh, 1vh) * 75)`;
      }
    }
    
    window.addEventListener('resize', adjustOverlayHeight);
    adjustOverlayHeight();
  }
  
  // Set up scroll progress indicator
  const overlays = document.querySelectorAll('.content-overlay');
  overlays.forEach(overlay => {
    overlay.addEventListener('scroll', function() {
      if (this.classList.contains('active')) {
        const scrollTop = this.scrollTop;
        const scrollHeight = this.scrollHeight;
        const clientHeight = this.clientHeight;
        const scrollPercent = (scrollTop / (scrollHeight - clientHeight)) * 100;
        
        const progressBar = this.querySelector('.progress-bar');
        if (progressBar) {
          progressBar.style.width = scrollPercent + '%';
        }
        
        // Remove reference to scroll indicator
        
        // Add animation for sections as they scroll into view
        const sections = this.querySelectorAll('.strategy-section, .strategy-card, .strategy-highlight');
        sections.forEach(section => {
          const rect = section.getBoundingClientRect();
          const isVisible = rect.top <= window.innerHeight * 0.8 && rect.bottom >= 0;
          
          if (isVisible && !section.classList.contains('animated')) {
            section.classList.add('animated');
            section.style.opacity = '1';
            section.style.transform = 'translateY(0)';
          }
        });
      }
    });
  });
  
  // Allow CTA button in strategy overlay to open contact overlay
  document.querySelectorAll('.cta-button[data-overlay]').forEach(button => {
    button.addEventListener('click', function() {
      const targetOverlay = this.getAttribute('data-overlay') + '-overlay';
      const currentOverlay = this.closest('.content-overlay');
      
      // Close current overlay
      currentOverlay.classList.remove('active');
      document.querySelector('.dock > button.active').classList.remove('active');
      
      // Open target overlay
      document.getElementById(targetOverlay).classList.add('active');
      
      // Find and activate corresponding dock button
      const targetButton = document.querySelector(`.dock > button[data-overlay="${this.getAttribute('data-overlay')}"]`);
      if (targetButton) {
        targetButton.classList.add('active');
      }
    });
  });
  
  // Contact Form Handling code removed
  
  // FAQ Toggle Functionality
  const faqItems = document.querySelectorAll('.faq-item');
  if (faqItems.length > 0) {
    faqItems.forEach(item => {
      const question = item.querySelector('.faq-question');
      
      question.addEventListener('click', () => {
        // Close other open FAQ items
        faqItems.forEach(otherItem => {
          if (otherItem !== item && otherItem.classList.contains('active')) {
            otherItem.classList.remove('active');
          }
        });
        
        // Toggle active class on clicked item
        item.classList.toggle('active');
      });
    });
  }
  
  // Portfolio filter functionality
  const filterButtons = document.querySelectorAll('.filter-button');
  const portfolioItems = document.querySelectorAll('.portfolio-item');
  
  filterButtons.forEach(button => {
    button.addEventListener('click', () => {
      // Update active button
      filterButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      
      const filterValue = button.getAttribute('data-filter');
      
      portfolioItems.forEach(item => {
        item.classList.add('hidden');
        item.classList.remove('visible');
        
        if (filterValue === 'all' || item.getAttribute('data-category').includes(filterValue)) {
          setTimeout(() => {
            item.classList.remove('hidden');
            item.classList.add('visible');
          }, 100);
        }
      });
    });
  });
  
  // Project modal functionality - Updated for root level modal
  const modal = document.getElementById('project-modal');
  const viewProjectButtons = document.querySelectorAll('.view-project-btn');
  const closeModal = document.querySelector('.close-modal');
  
  // Project details content - only keeping the two recent projects
  const projectData = {
    project1: {
      title: "Shyam Kemicals Website",
      client: "Shyam Kemicals",
      year: "2023",
      services: "Web Design, Development, Content Strategy, Google Ads",
      description: `
        <h3>Project Overview</h3>
        <p>Shyam Kemicals approached us needing a professional web presence that would showcase their chemical products and services. The website needed to be informative, easy to navigate, and establish their credibility in the industry.</p>
        <p>We delivered a comprehensive website solution that is currently live at <a href="https://www.shyamkemicals.com" target="_blank" style="color: var(--accent-color);">www.shyamkemicals.com</a>, featuring product catalogs, company information, and contact details.</p>
        
        <div class="project-testimonial">
          <p>"The website has significantly improved our online presence and helped us reach new customers. The team at Luveian understood our industry requirements and delivered a solution that perfectly represents our brand in the digital space."</p>
          <span class="testimonial-author">— Management Team, Shyam Kemicals</span>
        </div>
        
        <h3>Design & Development Approach</h3>
        <p>We focused on creating a clean, professional design that communicates trust and expertise, essential qualities in the chemical industry. The site architecture was organized to help visitors quickly find product information and technical specifications.</p>
        <p>The website was built with modern web technologies ensuring fast loading times, mobile responsiveness, and search engine optimization to improve the company's digital visibility.</p>
        
        <h3>Digital Marketing Campaign</h3>
        <p>In addition to website development, we managed Google Ads campaigns for Shyam Kemicals to increase their visibility in search results. Our targeted advertising strategy focused on industry-specific keywords, resulting in a significant increase in qualified leads and improved conversion rates for the client.</p>
        <p>The campaigns were carefully monitored and optimized regularly, ensuring the best possible ROI and helping Shyam Kemicals expand their market reach beyond their traditional customer base.</p>
      `
    },
    project2: {
      title: "King Rajasthan Royal Salon",
      client: "King Rajasthan Royal Salon",
      year: "2023",
      services: "Logo Design, Brand Identity, Social Media Management, Meta Advertising",
      description: `
        <h3>Project Overview</h3>
        <p>King Rajasthan Royal Salon needed a distinctive logo that would convey the luxury and premium nature of their grooming services while incorporating elements that reflect their Rajasthani heritage.</p>
        <p>Our design team created a logo that combines regal elements with modern aesthetics, establishing a strong visual identity for the salon in a competitive market.</p>
        
        <div class="project-image">
          <img src="../clients/kingrajasthanroyal/logo.jpeg" alt="King Rajasthan Royal Salon Logo" class="showcase-image" onerror="this.src='./assets/krr-logo.png'; this.onerror=null;">
        </div>
        
        <div class="project-testimonial">
          <p>"The logo perfectly captures the essence of our salon - royal tradition combined with contemporary style. We've received numerous compliments from our clients, and it has helped establish our brand recognition in the local market."</p>
          <span class="testimonial-author">— Owner, King Rajasthan Royal Salon</span>
        </div>
        
        <h3>Design Process</h3>
        <p>We began with extensive research into Rajasthani royal symbolism and contemporary salon branding to find the perfect intersection. After exploring multiple concepts, we refined the design through several iterations based on client feedback.</p>
        <p>The final logo uses a color palette inspired by traditional Rajasthani art combined with elegant typography that communicates luxury and premium service.</p>
        
        <h3>Social Media Management & Advertising</h3>
        <p>Beyond creating their visual identity, we managed King Rajasthan Royal Salon's social media presence across multiple platforms. Our team developed a content strategy that showcased their premium services, highlighted customer testimonials, and engaged with the local community.</p>
        <p>We complemented organic social media growth with targeted Meta advertising campaigns on Facebook and Instagram. These campaigns were designed to reach potential customers in the salon's service area, resulting in increased appointment bookings and higher customer retention rates.</p>
      `
    }
  };

  // Open modal with project data - modified to remove gallery for both projects
  viewProjectButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent event bubbling
      const projectId = button.getAttribute('data-project');
      const projectContent = projectData[projectId];
      
      if (projectContent) {
        // Create the modal content with restructured HTML for fixed sidebar layout
        const modalBody = modal.querySelector('.modal-body');
        modalBody.innerHTML = `
          <div class="project-header">
            <h2>${projectContent.title || 'Project Details'}</h2>
          </div>
          <div class="project-details">
            <div class="project-meta">
              <div class="meta-item">
                <h4>Client</h4>
                <p>${projectContent.client || 'Confidential'}</p>
              </div>
              <div class="meta-item">
                <h4>Year</h4>
                <p>${projectContent.year || '2023'}</p>
              </div>
              <div class="meta-item">
                <h4>Services</h4>
                <p>${projectContent.services || 'Design Services'}</p>
              </div>
              <div class="meta-item">
                <h4>Category</h4>
                <p>${projectContent.category || getProjectCategory(projectId)}</p>
              </div>
            </div>
            <div class="project-description">
              ${projectContent.description || '<p>Project details coming soon.</p>'}
            </div>
          </div>
        `;
        
        // Open the modal with improved animation
        modal.classList.add('active');
        document.body.classList.add('modal-open'); // Add class to body to prevent scrolling
        
        // Add a small delay before checking if content is scrollable
        setTimeout(() => {
          const projectDesc = modalBody.querySelector('.project-description');
          if (projectDesc && projectDesc.scrollHeight > projectDesc.clientHeight) {
            projectDesc.classList.add('scrollable');
          }
          
          // Force layout recalculation after content is loaded
          modalBody.style.display = 'none';
          setTimeout(() => {
            modalBody.style.display = '';
          }, 10);
        }, 100);
      }
    });
  });

  // Helper function to determine project category based on ID
  function getProjectCategory(projectId) {
    const portfolio = document.querySelector(`.portfolio-item[data-project="${projectId}"]`);
    if (portfolio) {
      const category = portfolio.closest('.portfolio-item').getAttribute('data-category');
      // Format category string to be more readable
      if (category) {
        return category
          .split(' ')
          .map(cat => cat.charAt(0).toUpperCase() + cat.slice(1))
          .join(', ');
      }
    }
    return 'Design & Development';
  }
  
  // Close modal with improved handling
  if (closeModal) {
    closeModal.addEventListener('click', (event) => {
      event.preventDefault(); // Prevent default behavior
      event.stopPropagation(); // Stop event from propagating
      console.log('Close button clicked'); // Debug log
      closeProjectModal();
    });
  } else {
    console.error('Close modal button not found'); // Debug log if button is missing
  }
  
  // Close modal on outside click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeProjectModal();
    }
  });
  
  // Close modal on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      closeProjectModal();
    }
  });
  
  // Function to close the project modal with cleanup
  function closeProjectModal() {
    console.log('Closing modal'); // Debug log
    modal.classList.remove('active');
    document.body.classList.remove('modal-open'); // Remove class from body
    
    // Give the body scroll back on mobile
    if (document.body.classList.contains('touch-device')) {
      document.body.style.overflow = '';
    }
    
    // Clear content after animation completes to prevent layout issues on next open
    setTimeout(() => {
      if (!modal.classList.contains('active')) {
        const modalBody = modal.querySelector('.modal-body');
        if (modalBody) modalBody.innerHTML = '';
      }
    }, 600); // Match the CSS transition duration
  }
});