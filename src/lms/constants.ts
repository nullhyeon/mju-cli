export const LMS_BASE = "https://lms.mju.ac.kr";
export const SSO_BASE = "https://sso.mju.ac.kr";
export const SSO_ENTRY =
  "https://sso.mju.ac.kr/sso/auth?response_type=code&client_id=lms" +
  "&state=Random%20String&redirect_uri=https://lms.mju.ac.kr/ilos/sso/sso_response.jsp";
export const MAIN_URL = `${LMS_BASE}/ilos/main/main_form.acl`;
export const STUDENT_CLASSROOM_ENTER_PATH = "/ilos/cls/st/co/eclass_room2.acl";
export const STUDENT_CLASSROOM_RETURN_URI = "/ilos/cls/st/submain/submain_form.acl";
export const STUDENT_CLASSROOM_MAIN_URL = `${LMS_BASE}${STUDENT_CLASSROOM_RETURN_URI}`;
export const STUDENT_ACTIVITY_LIST_URL =
  `${LMS_BASE}/ilos/cls/st/activity/activity_list.acl`;
export const STUDENT_NOTICE_LIST_URL =
  `${LMS_BASE}/ilos/cls/st/notice/notice_list.acl`;
export const STUDENT_NOTICE_VIEW_URL =
  `${LMS_BASE}/ilos/cls/st/notice/notice_view_pop.acl`;
export const STUDENT_MATERIAL_VIEW_URL =
  `${LMS_BASE}/ilos/cls/st/material/lecture_material_view_form.acl`;
export const STUDENT_OPEN_MATERIAL_LIST_URL =
  `${LMS_BASE}/ilos/cls/st/board/open_material_list.acl`;
export const STUDENT_OPEN_MATERIAL_VIEW_URL =
  `${LMS_BASE}/ilos/cls/st/board/open_material_view_pop.acl`;
export const FILE_LIST_URL = `${LMS_BASE}/ilos/co/efile_list.acl`;
